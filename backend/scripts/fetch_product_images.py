"""
Replace placeholder product imagery with real photos from Pexels.

    cd backend && .venv/Scripts/python scripts/fetch_product_images.py --dry-run
    cd backend && .venv/Scripts/python scripts/fetch_product_images.py

Products are named "<Brand> <Adjective> <Product Type>", so one Pexels search per
distinct type covers the whole catalogue (66 searches for 132 products). Photos are
dealt out so two products of the same type don't show the same picture.

Needs PEXELS_API_KEY in backend/.env (free key: https://www.pexels.com/api/).
Pexels photos are free for commercial use and may be hotlinked.
"""
import argparse
import os
import sys
import time
from collections import defaultdict

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from app.database import supabase  # noqa: E402

API = "https://api.pexels.com/v1/search"
# Pexels serves resized derivatives from the same URL via query params.
SIZE = "?auto=compress&cs=tinysrgb&w=900&h=900&fit=crop"
PER_TYPE = 6  # pool to deal from, so same-type products differ

# Product type (last two words of the name) -> what to actually search for. The map is
# explicit because several types are meaningless as search terms on their own
# ("SPF 50", "Media Stick", "Balm Trio").
SEARCH_TERMS = {
    "Chelsea Boot": "chelsea boots",
    "Leather Backpack": "leather backpack",
    "Cargo Pants": "cargo pants",
    "Countertop Organizer": "kitchen storage jars shelf",
    "Face Moisturizer": "face moisturizer cream jar",
    "Rain Boot": "rain boots",
    "Running Shoe": "running shoes",
    "Wireless Mouse": "computer mouse",
    "Card Holder": "card holder wallet",
    "Iron Griddle": "cast iron griddle pan",
    "Media Stick": "tv remote control",
    "Shampoo Bar": "shampoo soap bar",
    "SPF 50": "sunscreen bottle",
    "Styling Cream": "hair products bottles",
    "Throw Blanket": "folded blanket sofa",
    "USB-C Hub": "usb hub adapter",
    "Wool Beanie": "wool beanie hat",
    "1080p Webcam": "webcam computer camera",
    "Aviator Sunglasses": "aviator sunglasses",
    "Base Layer": "long sleeve athletic shirt",
    "Body Lotion": "body lotion bottle",
    "Body Wash": "body wash bottle",
    "Chukka Boot": "chukka boots",
    "Court Trainer": "tennis shoes sneakers",
    "Crossbody Bag": "crossbody bag",
    "Denim Jacket": "denim jacket",
    "Desk Lamp": "desk lamp",
    "Dutch Oven": "cast iron cooking pot",
    "Flannel Shirt": "flannel shirt",
    "Knife Set": "kitchen knife set",
    "Leather Belt": "leather belt",
    "Linen Shirt": "linen shirt",
    "Noise-Cancelling Headphones": "headphones",
    "Phone Stand": "phone stand",
    "Slide Sandal": "slide sandals",
    "Storage Ottoman": "upholstered footstool furniture",
    "Stud Earrings": "stud earrings",
    "Wax Candle": "candle",
    "Balm Trio": "lip balm",
    "Baseball Cap": "baseball cap",
    "C Serum": "serum dropper bottle",
    "Canvas Sneaker": "canvas sneakers",
    "Chain Necklace": "chain necklace",
    "Charcoal Toothpaste": "toothbrush dental hygiene",
    "Chino Pants": "khaki trousers folded",
    "Coffee Maker": "coffee maker",
    "Cutting Board": "wooden cutting board",
    "Electric Kettle": "kettle",
    "Everyday Hoodie": "hoodie",
    "Exfoliating Scrub": "skincare products cosmetics",
    "Face Mask": "face mask skincare",
    "Fitness Tracker": "fitness tracker watch",
    "Fleece Pullover": "fleece pullover",
    "Graphic Tee": "graphic t-shirt",
    "Leather Loafer": "leather loafers",
    "Leather Wallet": "leather wallet",
    "Portable Charger": "power bank charger",
    "Puffer Vest": "puffer vest",
    "Quilted Jacket": "quilted jacket",
    "Signature Hoodie": "hoodie",
    "Smart Watch": "smart watch",
    "Storage Set": "food storage containers",
    "Track Jacket": "track jacket",
    "Wireless Earbuds": "earbuds headphones case",
    "Wool Coat": "wool coat",
    "Wool Sweater": "wool sweater",
}


def product_type(name: str) -> str:
    return " ".join(name.split(" ")[-2:])


def search(client: httpx.Client, term: str) -> list[str]:
    # No orientation filter: square-only starves the result pool (and pushes abstract
    # crops to the top), while SIZE crops whatever comes back to a square anyway.
    res = client.get(API, params={"query": term, "per_page": PER_TYPE})
    if res.status_code == 401:
        sys.exit("[ERROR] Pexels rejected the API key. Check PEXELS_API_KEY in backend/.env.")
    if res.status_code == 429:
        sys.exit("[ERROR] Pexels rate limit hit (200/hour). Wait and re-run.")
    res.raise_for_status()
    return [p["src"]["original"] + SIZE for p in res.json().get("photos", [])]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing.")
    parser.add_argument(
        "--only",
        help="Comma-separated product types to refresh, e.g. \"Media Stick,Electric Kettle\". "
        "Used to re-pull the handful whose search term returned something unrelated.",
    )
    args = parser.parse_args()

    api_key = os.environ.get("PEXELS_API_KEY")
    if not api_key:
        sys.exit("[ERROR] PEXELS_API_KEY is not set in backend/.env (get one at https://www.pexels.com/api/).")

    products = supabase.table("products").select("id, name").order("name").execute().data or []
    images = supabase.table("product_images").select("id, product_id, display_order").execute().data or []
    by_product = defaultdict(list)
    for image in images:
        by_product[image["product_id"]].append(image)
    for rows in by_product.values():
        rows.sort(key=lambda r: r.get("display_order") or 0)

    grouped = defaultdict(list)
    for product in products:
        grouped[product_type(product["name"])].append(product)

    unknown = [t for t in grouped if t not in SEARCH_TERMS]
    if unknown:
        sys.exit(f"[ERROR] No search term mapped for: {', '.join(sorted(unknown))}")

    if args.only:
        wanted = {t.strip() for t in args.only.split(",") if t.strip()}
        missing = wanted - set(grouped)
        if missing:
            sys.exit(f"[ERROR] Not a product type: {', '.join(sorted(missing))}")
        grouped = {t: items for t, items in grouped.items() if t in wanted}

    print(f"{len(products)} products, {len(grouped)} distinct types, {len(images)} image rows\n")

    updates, misses = [], []
    with httpx.Client(headers={"Authorization": api_key}, timeout=30) as client:
        for index, (ptype, items) in enumerate(sorted(grouped.items()), start=1):
            term = SEARCH_TERMS[ptype]
            pool = search(client, term)
            status = f"{len(pool)} photos"
            if not pool:
                misses.append(ptype)
                status = "NO RESULTS - skipped"
            print(f"[{index:2}/{len(grouped)}] {ptype:<28} '{term}' -> {status}")

            for offset, product in enumerate(items):
                for slot, row in enumerate(by_product.get(product["id"], [])):
                    if not pool:
                        continue
                    # Deal from the pool so same-type products start at different photos.
                    url = pool[(offset * 2 + slot) % len(pool)]
                    updates.append({"id": row["id"], "url": url})
            time.sleep(0.2)  # stay well inside the 200/hour limit

    print(f"\n{len(updates)} image rows to update")
    if misses:
        print(f"No photos found for: {', '.join(misses)} (left unchanged)")

    if args.dry_run:
        print("\nDry run - nothing written.")
        return

    for update in updates:
        supabase.table("product_images").update({"url": update["url"]}).eq("id", update["id"]).execute()
    print("Done.")


if __name__ == "__main__":
    main()
