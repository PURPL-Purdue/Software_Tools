"""Create the locations used by the PowerPoint mockup if they do not exist.

Run from the backend directory:
    python scripts/bootstrap_mockup_locations.py
"""
import asyncio

from app.db import connect, disconnect, get_db, utcnow
from app.utils import clean_key

LOCATIONS = [
    ("Red toolbox top drawer", "available"),
    ("Biggie-K Stand", "in_use"),
    ("Outer Stand", "in_use"),
    ("Tiny Stand", "in_use"),
]


async def main():
    await connect()
    try:
        db = get_db()
        for name, state in LOCATIONS:
            now = utcnow()
            await db.locations.update_one(
                {"name_key": clean_key(name)},
                {
                    "$setOnInsert": {
                        "name": name,
                        "name_key": clean_key(name),
                        "state": state,
                        "description": "",
                        "active": True,
                        "created_at": now,
                        "updated_at": now,
                    }
                },
                upsert=True,
            )
            print(f"Ready: {name}")
    finally:
        await disconnect()


if __name__ == "__main__":
    asyncio.run(main())
