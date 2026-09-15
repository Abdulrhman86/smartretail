"""
Grant or revoke the admin role for a Supabase Auth user.

Usage (from the backend/ folder, with the virtualenv active):
    python scripts/make_admin.py you@example.com            # grant admin
    python scripts/make_admin.py you@example.com --revoke   # back to customer

The role is stored in the user's app_metadata, which only the service_role key can modify.
Log out and back in on the frontend afterwards so the new role is picked up.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import supabase  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("email")
    parser.add_argument("--revoke", action="store_true", help="Set the role back to customer")
    args = parser.parse_args()

    email = args.email.strip().lower()
    user, page = None, 1
    while user is None:
        batch = supabase.auth.admin.list_users(page=page, per_page=1000)
        user = next((u for u in batch if (u.email or "").lower() == email), None)
        if len(batch) < 1000:
            break
        page += 1

    if user is None:
        print(f"No Supabase Auth user found with email {email}. Sign up on the site first.")
        return 1

    role = "customer" if args.revoke else "admin"
    supabase.auth.admin.update_user_by_id(user.id, {"app_metadata": {**(user.app_metadata or {}), "role": role}})
    print(f"{email} is now: {role}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
