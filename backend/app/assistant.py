"""
Gemini chat engine shared by the customer and admin assistants.

The model never sees the database directly: it can only call the tools it is given, and each
tool returns already-shaped data. Structured results (product cards, report tables, proposed
actions) travel back to the client alongside the text so the UI renders real values instead of
trusting the model to repeat them correctly.
"""
import logging
import os
from dataclasses import dataclass, field
from typing import Callable, Optional

from fastapi import HTTPException
from google import genai
from google.genai import types

logger = logging.getLogger("smartretail")

# Chosen for the free tier: gemini-3.6-flash allows only ~5 requests/minute, and a single chat
# turn costs two or more, so the lite model keeps the demo usable. Override with GEMINI_MODEL.
DEFAULT_MODEL = "gemini-3.5-flash-lite"
MAX_TOOL_ROUNDS = 4  # tool call -> result -> model, repeated; caps latency and free-tier usage
MAX_HISTORY_MESSAGES = 10


@dataclass
class ToolResult:
    """What a tool hands back: `data` goes to the model, the rest goes to the client."""
    data: dict
    products: Optional[list] = None
    report: Optional[dict] = None
    pending_action: Optional[dict] = None


@dataclass
class Tool:
    declaration: types.FunctionDeclaration
    handler: Callable[[dict], ToolResult]


@dataclass
class ChatOutcome:
    reply: str = ""
    products: list = field(default_factory=list)
    report: Optional[dict] = None
    pending_action: Optional[dict] = None


_client: Optional[genai.Client] = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="The assistant is not configured on this server.")
        _client = genai.Client(api_key=api_key)
    return _client


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)


def _to_contents(messages: list) -> list[types.Content]:
    contents = []
    for message in messages[-MAX_HISTORY_MESSAGES:]:
        text = (message.content or "").strip()
        if not text:
            continue
        contents.append(
            types.Content(role="user" if message.role == "user" else "model", parts=[types.Part(text=text)])
        )
    return contents


def _call_model(contents: list[types.Content], config: types.GenerateContentConfig):
    try:
        return get_client().models.generate_content(model=model_name(), contents=contents, config=config)
    except genai.errors.ClientError as exc:
        logger.error("Gemini client error: %s", exc)
        if getattr(exc, "code", None) == 429:
            raise HTTPException(status_code=429, detail="The assistant has hit its usage limit for now. Try again shortly.")
        raise HTTPException(status_code=503, detail="The assistant is unavailable right now.")
    except genai.errors.APIError as exc:
        logger.error("Gemini API error: %s", exc)
        raise HTTPException(status_code=503, detail="The assistant is unavailable right now. Please try again in a moment.")


def run_chat(*, messages: list, system_instruction: str, tools: list[Tool]) -> ChatOutcome:
    tool_map = {tool.declaration.name: tool for tool in tools}
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[types.Tool(function_declarations=[tool.declaration for tool in tools])],
        # The SDK's automatic function calling would try to invoke the declarations itself;
        # the loop below runs them so tool results can also be returned to the client.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.2,
    )
    contents = _to_contents(messages)
    if not contents:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    outcome = ChatOutcome()

    for _ in range(MAX_TOOL_ROUNDS):
        response = _call_model(contents, config)
        candidate = response.candidates[0] if response.candidates else None
        if not candidate or not candidate.content or not candidate.content.parts:
            break

        calls = [part.function_call for part in candidate.content.parts if part.function_call]
        if not calls:
            outcome.reply = (response.text or "").strip()
            return outcome

        contents.append(candidate.content)
        results = []
        for call in calls:
            tool = tool_map.get(call.name)
            if tool is None:
                payload = {"error": f"No such tool: {call.name}"}
            else:
                payload = _run_tool(tool, dict(call.args or {}), outcome)
            results.append(
                types.Part(function_response=types.FunctionResponse(name=call.name, response=payload))
            )
        contents.append(types.Content(role="user", parts=results))

    # Ran out of tool rounds — ask once more with tools withheld so the model has to answer.
    final = _call_model(contents, types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.2))
    outcome.reply = (final.text or "").strip() or "I wasn't able to finish that request. Could you rephrase it?"
    return outcome


def _run_tool(tool: Tool, args: dict, outcome: ChatOutcome) -> dict:
    """Tool failures are reported back to the model as data, not raised, so it can explain the
    problem to the user instead of the whole request 500ing."""
    try:
        result = tool.handler(args)
    except HTTPException as exc:
        return {"error": exc.detail}
    except Exception:
        logger.exception("Assistant tool %s failed", tool.declaration.name)
        return {"error": "That lookup failed."}

    if result.products:
        outcome.products = result.products
    if result.report:
        outcome.report = result.report
    if result.pending_action:
        outcome.pending_action = result.pending_action
    return result.data
