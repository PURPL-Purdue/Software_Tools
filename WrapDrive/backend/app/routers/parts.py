"""Part details, notes, relations, stock summaries, history, and serialized units."""
from __future__ import annotations

from decimal import Decimal
import re
from fastapi import APIRouter, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from ..db import get_db, utcnow
from ..models import (
    NoteCreate,
    PartCreate,
    PartUpdate,
    RelationCreate,
    StockBatchRequest,
    StockReconcileRequest,
    TrackedUnitCreate,
    TrackedUnitRetire,
    TrackedUnitUpdate,
)
from ..services.stock import apply_stock_batch, create_tracked_unit, retire_tracked_unit, update_tracked_unit
from ..utils import clean_key, oid, quantity_decimal, serialize_doc

router = APIRouter(prefix="/parts", tags=["parts"])


def _part_doc(payload: PartCreate) -> dict:
    now = utcnow()
    purpl = payload.purpl_part_number.strip() if payload.purpl_part_number else None
    return {
        "name": payload.name,
        "name_key": clean_key(payload.name),
        "description": payload.description,
        "manufacturer_part_number": payload.manufacturer_part_number,
        "purpl_part_number": purpl,
        "purpl_part_number_key": clean_key(purpl) if purpl else None,
        "category_id": oid(payload.category_id, "category id") if payload.category_id else None,
        "tags": list(dict.fromkeys(t.strip() for t in payload.tags if t.strip())),
        "tags_key": list(dict.fromkeys(clean_key(t) for t in payload.tags if t.strip())),
        "specifications": [s.model_dump() for s in payload.specifications],
        "stock_unit": payload.stock_unit,
        "allocations": [],
        "stock_version": 0,
        "notes": [],
        "relations": [],
        "image_url": payload.image_url,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }


async def _category_exists(category_id: str | None) -> None:
    if category_id and not await get_db().categories.find_one({"_id": oid(category_id, "category id")}):
        raise HTTPException(status_code=400, detail="Category does not exist")


async def _stock_summary(part: dict) -> dict:
    database = get_db()
    allocations = part.get("allocations", [])
    location_ids = [a["location_id"] for a in allocations]
    locations = {
        str(d["_id"]): d
        async for d in database.locations.find({"_id": {"$in": location_ids}})
    } if location_ids else {}

    tracked_unavailable: dict[str, Decimal] = {}
    async for unit in database.tracked_units.find(
        {"part_id": part["_id"], "status": {"$in": ["damaged", "lost"]}}
    ):
        key = str(unit["location_id"])
        tracked_unavailable[key] = tracked_unavailable.get(key, Decimal(0)) + Decimal(1)

    total = Decimal(0)
    available = Decimal(0)
    in_use = Decimal(0)
    unavailable = Decimal(0)
    detail = []
    for allocation in allocations:
        qty = quantity_decimal(allocation.get("quantity", 0))
        total += qty
        location = locations.get(str(allocation["location_id"]))
        if not location:
            state = "unavailable"
            location_name = "Deleted/unknown location"
        else:
            state = location.get("state", "available")
            location_name = location.get("name", "Unknown")
        blocked = min(qty, tracked_unavailable.get(str(allocation["location_id"]), Decimal(0)))
        usable = qty - blocked
        if state == "available":
            available += usable
            unavailable += blocked
        elif state == "in_use":
            in_use += usable
            unavailable += blocked
        else:
            unavailable += qty
        detail.append(
            {
                "location_id": str(allocation["location_id"]),
                "location_name": location_name,
                "state": state,
                "quantity": float(qty),
            }
        )

    return {
        "unit": part.get("stock_unit", "each"),
        "total": float(total),
        "available": float(available),
        "in_use": float(in_use),
        "unavailable": float(unavailable),
        "allocations": detail,
        "stock_version": part.get("stock_version", 0),
        "last_updated": part.get("updated_at"),
    }


async def _hydrate_part(part: dict) -> dict:
    data = serialize_doc(part)
    if part.get("category_id"):
        category = await get_db().categories.find_one({"_id": part["category_id"]})
        data["category"] = serialize_doc(category) if category else None
    else:
        data["category"] = None
    data["stock"] = await _stock_summary(part)
    return data


@router.get("")
async def list_parts(
    q: str | None = Query(default=None, max_length=200),
    category_id: str | None = None,
    tags: list[str] | None = Query(default=None),
    location_id: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    database = get_db()
    query: dict = {}
    if not include_archived:
        query["archived"] = {"$ne": True}
    if q and q.strip():
        # Regex is intentional here because the UI expects partial part-number/name matching.
        safe = re.escape(q.strip())
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"description": {"$regex": safe, "$options": "i"}},
            {"manufacturer_part_number": {"$regex": safe, "$options": "i"}},
            {"purpl_part_number": {"$regex": safe, "$options": "i"}},
            {"tags": {"$regex": safe, "$options": "i"}},
        ]
    if category_id:
        query["category_id"] = oid(category_id, "category id")
    if tags:
        query["tags_key"] = {"$all": [clean_key(t) for t in tags]}
    if location_id:
        query["allocations"] = {"$elemMatch": {"location_id": oid(location_id, "location id"), "quantity": {"$gt": 0}}}

    cursor = database.parts.find(query).sort("name_key", 1).skip(skip).limit(limit)
    parts = [await _hydrate_part(doc) async for doc in cursor]
    total = await database.parts.count_documents(query)
    return {"items": parts, "total": total, "skip": skip, "limit": limit}


@router.post("", status_code=201)
async def create_part(payload: PartCreate):
    await _category_exists(payload.category_id)
    doc = _part_doc(payload)
    try:
        result = await get_db().parts.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="PURPL part number already exists") from exc
    doc["_id"] = result.inserted_id
    return await _hydrate_part(doc)


@router.get("/{part_id}")
async def get_part(part_id: str):
    part = await get_db().parts.find_one({"_id": oid(part_id, "part id")})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return await _hydrate_part(part)


@router.patch("/{part_id}")
async def update_part(part_id: str, payload: PartUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes:
        await _category_exists(changes["category_id"])
        changes["category_id"] = oid(changes["category_id"], "category id") if changes["category_id"] else None
    if "name" in changes:
        changes["name_key"] = clean_key(changes["name"])
    if "purpl_part_number" in changes:
        value = changes["purpl_part_number"]
        changes["purpl_part_number_key"] = clean_key(value) if value else None
    if "tags" in changes:
        tags = list(dict.fromkeys(t.strip() for t in changes["tags"] if t.strip()))
        changes["tags"] = tags
        changes["tags_key"] = [clean_key(t) for t in tags]
    if "specifications" in changes:
        changes["specifications"] = [s.model_dump() if hasattr(s, "model_dump") else s for s in changes["specifications"]]
    changes["updated_at"] = utcnow()
    try:
        result = await get_db().parts.update_one({"_id": oid(part_id, "part id")}, {"$set": changes})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="PURPL part number already exists") from exc
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Part not found")
    return await get_part(part_id)


@router.delete("/{part_id}")
async def delete_part(part_id: str):
    database = get_db()
    part_oid = oid(part_id, "part id")
    if await database.stock_events.find_one({"part_id": part_oid}) or await database.tracked_units.find_one({"part_id": part_oid}):
        raise HTTPException(
            status_code=409,
            detail="Parts with stock history or tracked units cannot be hard-deleted; archive them instead.",
        )
    result = await database.parts.delete_one({"_id": part_oid})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Part not found")
    return {"ok": True}


@router.post("/{part_id}/notes", status_code=201)
async def add_note(part_id: str, payload: NoteCreate):
    note = {"id": __import__("uuid").uuid4().hex, "text": payload.text, "author": payload.author, "created_at": utcnow()}
    result = await get_db().parts.update_one(
        {"_id": oid(part_id, "part id")}, {"$push": {"notes": {"$each": [note], "$position": 0}}, "$set": {"updated_at": utcnow()}}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Part not found")
    return serialize_doc(note)


@router.delete("/{part_id}/notes/{note_id}")
async def delete_note(part_id: str, note_id: str):
    result = await get_db().parts.update_one(
        {"_id": oid(part_id, "part id")}, {"$pull": {"notes": {"id": note_id}}, "$set": {"updated_at": utcnow()}}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Part not found")
    return {"ok": True}


@router.post("/{part_id}/relations", status_code=201)
async def add_relation(part_id: str, payload: RelationCreate):
    database = get_db()
    part_oid = oid(part_id, "part id")
    related_oid = oid(payload.related_part_id, "related part id")
    if part_oid == related_oid:
        raise HTTPException(status_code=400, detail="A part cannot be related to itself")
    if not await database.parts.find_one({"_id": related_oid}):
        raise HTTPException(status_code=404, detail="Related part not found")
    relation = {"part_id": related_oid, "relationship": payload.relationship, "note": payload.note}
    result = await database.parts.update_one(
        {"_id": part_oid, "relations.part_id": {"$ne": related_oid}},
        {"$push": {"relations": relation}, "$set": {"updated_at": utcnow()}},
    )
    if not result.matched_count:
        if not await database.parts.find_one({"_id": part_oid}):
            raise HTTPException(status_code=404, detail="Part not found")
        raise HTTPException(status_code=409, detail="That related part is already linked")
    return {"ok": True}


@router.get("/{part_id}/relations")
async def list_relations(part_id: str):
    database = get_db()
    part = await database.parts.find_one({"_id": oid(part_id, "part id")})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    result = []
    for relation in part.get("relations", []):
        related = await database.parts.find_one({"_id": relation["part_id"]})
        if related:
            result.append({"relationship": relation["relationship"], "note": relation.get("note", ""), "part": await _hydrate_part(related)})
    return result


@router.delete("/{part_id}/relations/{related_part_id}")
async def remove_relation(part_id: str, related_part_id: str):
    result = await get_db().parts.update_one(
        {"_id": oid(part_id, "part id")},
        {"$pull": {"relations": {"part_id": oid(related_part_id, "related part id")}}, "$set": {"updated_at": utcnow()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Part not found")
    return {"ok": True}


@router.get("/{part_id}/stock")
async def get_stock(part_id: str):
    part = await get_db().parts.find_one({"_id": oid(part_id, "part id")})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return await _stock_summary(part)


@router.post("/{part_id}/stock/changes")
async def change_stock(part_id: str, payload: StockBatchRequest):
    return await apply_stock_batch(part_id, payload)


@router.post("/{part_id}/stock/reconcile")
async def reconcile_stock(part_id: str, payload: StockReconcileRequest):
    """Set displayed allocation rows to target quantities without trusting the browser to calculate totals.

    This maps directly to the mockup's editable stock table: the client sends the desired
    quantity for each edited location plus a note, and the server converts the differences
    into audited stock adjustments.
    """
    part = await get_db().parts.find_one({"_id": oid(part_id, "part id")})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    current = {str(a["location_id"]): float(a.get("quantity", 0)) for a in part.get("allocations", [])}
    changes = []
    from ..models import StockChange, StockOperationType
    for edit in payload.edits:
        old = current.get(edit.location_id, 0.0)
        delta = round(edit.new_quantity - old, 6)
        if delta > 0:
            changes.append(StockChange(operation=StockOperationType.adjust, quantity=delta, to_location_id=edit.location_id, note=edit.note))
        elif delta < 0:
            changes.append(StockChange(operation=StockOperationType.adjust, quantity=-delta, from_location_id=edit.location_id, note=edit.note))
    if not changes:
        return {"ok": True, "changed": False}
    result = await apply_stock_batch(part_id, StockBatchRequest(actor=payload.actor, changes=changes))
    return {**result, "changed": True}


@router.get("/{part_id}/stock/history")
async def stock_history(part_id: str, limit: int = Query(default=100, ge=1, le=500), skip: int = Query(default=0, ge=0)):
    part_oid = oid(part_id, "part id")
    if not await get_db().parts.find_one({"_id": part_oid}):
        raise HTTPException(status_code=404, detail="Part not found")
    cursor = get_db().stock_events.find({"part_id": part_oid}).sort("created_at", -1).skip(skip).limit(limit)
    return [serialize_doc(d) async for d in cursor]


@router.get("/{part_id}/tracked-units")
async def list_tracked_units(part_id: str, include_retired: bool = False):
    query = {"part_id": oid(part_id, "part id")}
    if not include_retired:
        query["status"] = {"$ne": "retired"}
    cursor = get_db().tracked_units.find(query).sort("created_at", -1)
    return [serialize_doc(d) async for d in cursor]


@router.post("/{part_id}/tracked-units", status_code=201)
async def track_unit(part_id: str, payload: TrackedUnitCreate):
    return await create_tracked_unit(part_id, payload)


@router.patch("/{part_id}/tracked-units/{unit_id}")
async def patch_tracked_unit(part_id: str, unit_id: str, payload: TrackedUnitUpdate):
    return await update_tracked_unit(part_id, unit_id, payload)


@router.post("/{part_id}/tracked-units/{unit_id}/retire")
async def retire_unit(part_id: str, unit_id: str, payload: TrackedUnitRetire):
    return await retire_tracked_unit(part_id, unit_id, payload)
