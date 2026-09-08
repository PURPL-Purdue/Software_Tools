"""MongoDB connection, indexes, and reusable database helpers."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from pymongo import ASCENDING, DESCENDING, IndexModel

from .config import settings

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None
fs: AsyncIOMotorGridFSBucket | None = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def connect() -> None:
    """Connect once at application startup and create required indexes."""
    global client, db, fs
    settings.validate()
    client = AsyncIOMotorClient(
        settings.mongodb_url,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000,
        retryWrites=True,
    )
    await client.admin.command("ping")
    db = client[settings.mongodb_database]
    fs = AsyncIOMotorGridFSBucket(db, bucket_name="attachments")
    await ensure_indexes()


async def disconnect() -> None:
    global client, db, fs
    if client is not None:
        client.close()
    client = None
    db = None
    fs = None


def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database has not been initialized")
    return db


def get_fs() -> AsyncIOMotorGridFSBucket:
    if fs is None:
        raise RuntimeError("GridFS has not been initialized")
    return fs


def get_client() -> AsyncIOMotorClient:
    if client is None:
        raise RuntimeError("MongoDB client has not been initialized")
    return client


async def ensure_indexes() -> None:
    database = get_db()

    await database.parts.create_indexes(
        [
            IndexModel([("purpl_part_number_key", ASCENDING)], unique=True, sparse=True),
            IndexModel([("name_key", ASCENDING)]),
            IndexModel([("category_id", ASCENDING)]),
            IndexModel([("tags_key", ASCENDING)]),
            IndexModel([("updated_at", DESCENDING)]),
            IndexModel(
                [
                    ("name", "text"),
                    ("description", "text"),
                    ("manufacturer_part_number", "text"),
                    ("purpl_part_number", "text"),
                    ("tags", "text"),
                ],
                name="part_text_search",
                default_language="english",
            ),
        ]
    )
    await database.categories.create_index("name_key", unique=True)
    await database.locations.create_index("name_key", unique=True)
    await database.stock_events.create_indexes(
        [
            IndexModel([("part_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("event_group_id", ASCENDING)]),
        ]
    )
    await database.tracked_units.create_indexes(
        [
            IndexModel([("part_id", ASCENDING), ("serial_key", ASCENDING)], unique=True),
            IndexModel([("part_id", ASCENDING), ("location_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
        ]
    )
    await database.attachments_meta.create_index([("part_id", ASCENDING), ("created_at", DESCENDING)])
