"""Category, location, and tag endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from ..db import get_db, utcnow
from ..models import LocationCreate, LocationUpdate, NameCreate
from ..utils import clean_key, oid, serialize_doc

router = APIRouter(tags=["metadata"])


@router.get("/categories")
async def list_categories():
    docs = await get_db().categories.find().sort("name", 1).to_list(500)
    return [serialize_doc(d) for d in docs]


@router.post("/categories", status_code=201)
async def create_category(payload: NameCreate):
    now = utcnow()
    doc = {"name": payload.name, "name_key": clean_key(payload.name), "created_at": now}
    try:
        result = await get_db().categories.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Category already exists") from exc
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.patch("/categories/{category_id}")
async def update_category(category_id: str, payload: NameCreate):
    changes = {"name": payload.name, "name_key": clean_key(payload.name), "updated_at": utcnow()}
    try:
        result = await get_db().categories.update_one(
            {"_id": oid(category_id, "category id")}, {"$set": changes}
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Category already exists") from exc
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    database = get_db()
    category_oid = oid(category_id, "category id")
    if await database.parts.find_one({"category_id": category_oid}):
        raise HTTPException(status_code=409, detail="Category is still assigned to one or more parts")
    result = await database.categories.delete_one({"_id": category_oid})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


@router.get("/locations")
async def list_locations(include_inactive: bool = False):
    query = {} if include_inactive else {"active": True}
    docs = await get_db().locations.find(query).sort("name", 1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@router.post("/locations", status_code=201)
async def create_location(payload: LocationCreate):
    now = utcnow()
    doc = {
        "name": payload.name,
        "name_key": clean_key(payload.name),
        "state": payload.state.value,
        "description": payload.description,
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await get_db().locations.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Location already exists") from exc
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.patch("/locations/{location_id}")
async def update_location(location_id: str, payload: LocationUpdate):
    changes = payload.model_dump(exclude_none=True)
    if "state" in changes:
        changes["state"] = changes["state"].value
    if "name" in changes:
        changes["name_key"] = clean_key(changes["name"])
    changes["updated_at"] = utcnow()
    try:
        result = await get_db().locations.update_one({"_id": oid(location_id, "location id")}, {"$set": changes})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Another location already uses that name") from exc
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"ok": True}


@router.delete("/locations/{location_id}")
async def delete_location(location_id: str):
    database = get_db()
    location_oid = oid(location_id, "location id")
    location = await database.locations.find_one({"_id": location_oid})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    has_stock = await database.parts.find_one(
        {"allocations": {"$elemMatch": {"location_id": location_oid, "quantity": {"$gt": 0}}}}
    )
    has_tracked_units = await database.tracked_units.find_one(
        {"location_id": location_oid, "status": {"$in": ["active", "damaged", "lost"]}}
    )
    if has_stock or has_tracked_units:
        raise HTTPException(
            status_code=409,
            detail="this location still contains units! reallocate and try again.",
        )
    await database.locations.delete_one({"_id": location_oid})
    return {"ok": True}


@router.get("/tags")
async def list_tags():
    database = get_db()
    existing = await database.tags.find().sort("name_key", 1).to_list(1000)
    values = [doc["name"] for doc in existing]
    values.extend(await database.parts.distinct("tags"))
    by_key = {}
    for value in values:
        if isinstance(value, str) and value.strip():
            by_key.setdefault(clean_key(value), value.strip())
    return sorted(by_key.values(), key=str.casefold)


@router.post("/tags", status_code=201)
async def create_tag(payload: NameCreate):
    database = get_db()
    key = clean_key(payload.name)
    if await database.parts.find_one({"tags_key": key}):
        raise HTTPException(status_code=409, detail="A tag with that name already exists")
    doc = {"name": payload.name, "name_key": key, "created_at": utcnow()}
    try:
        result = await database.tags.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A tag with that name already exists") from exc
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.patch("/tags/{tag_name}")
async def rename_tag(tag_name: str, payload: NameCreate):
    database = get_db()
    old_key = clean_key(tag_name)
    new_key = clean_key(payload.name)
    async for part in database.parts.find({"$or": [{"tags_key": old_key}, {"tags": tag_name}]}):
        updated = []
        seen = set()
        for value in part.get("tags", []):
            canonical = payload.name if clean_key(value) == old_key else value
            canonical_key = clean_key(canonical)
            if canonical_key not in seen:
                updated.append(canonical)
                seen.add(canonical_key)
        await database.parts.update_one(
            {"_id": part["_id"]},
            {"$set": {"tags": updated, "tags_key": [clean_key(value) for value in updated], "updated_at": utcnow()}},
        )

    await database.tags.delete_many({"name_key": old_key})
    try:
        await database.tags.update_one(
            {"name_key": new_key},
            {"$set": {"name": payload.name, "updated_at": utcnow()}, "$setOnInsert": {"created_at": utcnow()}},
            upsert=True,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A tag with that name already exists") from exc
    return {"ok": True}


@router.delete("/tags/{tag_name}")
async def delete_tag(tag_name: str):
    database = get_db()
    key = clean_key(tag_name)
    async for part in database.parts.find({"$or": [{"tags_key": key}, {"tags": tag_name}]}):
        kept = [value for value in part.get("tags", []) if clean_key(value) != key]
        await database.parts.update_one(
            {"_id": part["_id"]},
            {"$set": {"tags": kept, "tags_key": [clean_key(value) for value in kept], "updated_at": utcnow()}},
        )
    await database.tags.delete_many({"name_key": key})
    return {"ok": True}
