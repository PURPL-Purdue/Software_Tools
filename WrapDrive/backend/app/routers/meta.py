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


@router.get("/tags")
async def list_tags():
    tags = await get_db().parts.distinct("tags")
    return sorted({tag for tag in tags if isinstance(tag, str)}, key=str.casefold)
