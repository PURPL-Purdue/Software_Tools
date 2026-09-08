"""Stock mutation service.

All quantity-changing operations are applied as one MongoDB transaction together with
an immutable stock-event record. This prevents a stock snapshot from changing without
its corresponding audit history (or vice versa).
"""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from uuid import uuid4

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError, OperationFailure

from ..db import get_client, get_db, utcnow
from ..models import StockBatchRequest, StockOperationType
from ..utils import oid, quantity_decimal

ZERO = Decimal("0")


def _alloc_map(part: dict) -> dict[str, Decimal]:
    result: dict[str, Decimal] = {}
    for allocation in part.get("allocations", []):
        result[str(allocation["location_id"])] = quantity_decimal(allocation.get("quantity", 0))
    return result


def _alloc_list(values: dict[str, Decimal]) -> list[dict]:
    return [
        {"location_id": ObjectId(location_id), "quantity": float(quantity)}
        for location_id, quantity in values.items()
        if quantity != ZERO
    ]


async def _validate_locations(location_ids: set[str], session) -> None:
    if not location_ids:
        return
    database = get_db()
    object_ids = [oid(v, "location id") for v in location_ids]
    found = await database.locations.count_documents(
        {"_id": {"$in": object_ids}, "active": True}, session=session
    )
    if found != len(object_ids):
        raise HTTPException(status_code=400, detail="One or more stock locations are invalid or inactive")


async def apply_stock_batch(part_id: str, request: StockBatchRequest) -> dict:
    database = get_db()
    mongo_part_id = oid(part_id, "part id")
    location_ids: set[str] = set()
    for change in request.changes:
        if change.from_location_id:
            location_ids.add(change.from_location_id)
        if change.to_location_id:
            location_ids.add(change.to_location_id)

    client = get_client()
    async with await client.start_session() as session:
        async with session.start_transaction():
            part = await database.parts.find_one({"_id": mongo_part_id}, session=session)
            if not part:
                raise HTTPException(status_code=404, detail="Part not found")
            await _validate_locations(location_ids, session)

            allocations = _alloc_map(part)
            events: list[dict] = []
            event_group_id = str(uuid4())
            now = utcnow()

            for change in request.changes:
                qty = quantity_decimal(change.quantity)
                before = deepcopy(allocations)
                from_id = change.from_location_id
                to_id = change.to_location_id

                if change.operation == StockOperationType.receive:
                    if not to_id or from_id:
                        raise HTTPException(status_code=400, detail="receive requires only to_location_id")
                    allocations[to_id] = allocations.get(to_id, ZERO) + qty

                elif change.operation == StockOperationType.remove:
                    if not from_id or to_id:
                        raise HTTPException(status_code=400, detail="remove requires only from_location_id")
                    current = allocations.get(from_id, ZERO)
                    if current < qty:
                        raise HTTPException(status_code=409, detail="Not enough stock in source location")
                    allocations[from_id] = current - qty

                elif change.operation == StockOperationType.move:
                    if not from_id or not to_id or from_id == to_id:
                        raise HTTPException(
                            status_code=400,
                            detail="move requires different from_location_id and to_location_id",
                        )
                    current = allocations.get(from_id, ZERO)
                    if current < qty:
                        raise HTTPException(status_code=409, detail="Not enough stock in source location")
                    allocations[from_id] = current - qty
                    allocations[to_id] = allocations.get(to_id, ZERO) + qty

                elif change.operation == StockOperationType.adjust:
                    if bool(from_id) == bool(to_id):
                        raise HTTPException(
                            status_code=400,
                            detail="adjust requires exactly one of from_location_id or to_location_id",
                        )
                    if to_id:
                        allocations[to_id] = allocations.get(to_id, ZERO) + qty
                    else:
                        current = allocations.get(from_id or "", ZERO)
                        if current < qty:
                            raise HTTPException(status_code=409, detail="Adjustment would make stock negative")
                        allocations[from_id or ""] = current - qty

                after_total = sum(allocations.values(), ZERO)
                if after_total < ZERO or any(v < ZERO for v in allocations.values()):
                    raise HTTPException(status_code=409, detail="Stock cannot become negative")

                events.append(
                    {
                        "part_id": mongo_part_id,
                        "event_group_id": event_group_id,
                        "operation": change.operation.value,
                        "quantity": float(qty),
                        "from_location_id": oid(from_id, "location id") if from_id else None,
                        "to_location_id": oid(to_id, "location id") if to_id else None,
                        "note": change.note,
                        "actor": request.actor,
                        "before_total": float(sum(before.values(), ZERO)),
                        "after_total": float(after_total),
                        "created_at": now,
                    }
                )

            result = await database.parts.update_one(
                {"_id": mongo_part_id, "stock_version": part.get("stock_version", 0)},
                {
                    "$set": {"allocations": _alloc_list(allocations), "updated_at": now},
                    "$inc": {"stock_version": 1},
                },
                session=session,
            )
            if result.modified_count != 1:
                raise HTTPException(
                    status_code=409,
                    detail="Stock changed while you were editing. Refresh and try again.",
                )
            await database.stock_events.insert_many(events, session=session)

    return {"ok": True, "event_group_id": event_group_id}


async def create_tracked_unit(part_id: str, payload) -> dict:
    database = get_db()
    client = get_client()
    mongo_part_id = oid(part_id, "part id")
    location_id = oid(payload.location_id, "location id")
    now = utcnow()

    async with await client.start_session() as session:
        async with session.start_transaction():
            part = await database.parts.find_one({"_id": mongo_part_id}, session=session)
            if not part:
                raise HTTPException(status_code=404, detail="Part not found")
            location = await database.locations.find_one({"_id": location_id, "active": True}, session=session)
            if not location:
                raise HTTPException(status_code=400, detail="Location is invalid or inactive")
            available_at_location = _alloc_map(part).get(str(location_id), ZERO)
            tracked_count = await database.tracked_units.count_documents(
                {"part_id": mongo_part_id, "location_id": location_id, "status": {"$ne": "retired"}},
                session=session,
            )
            if Decimal(tracked_count) >= available_at_location:
                raise HTTPException(
                    status_code=409,
                    detail="All stock at this location is already individually tracked",
                )

            doc = {
                "part_id": mongo_part_id,
                "serial": payload.serial,
                "serial_key": payload.serial.strip().casefold(),
                "location_id": location_id,
                "status": payload.status.value,
                "description": payload.description,
                "kit": payload.kit,
                "created_at": now,
                "updated_at": now,
            }
            try:
                result = await database.tracked_units.insert_one(doc, session=session)
            except DuplicateKeyError as exc:
                raise HTTPException(status_code=409, detail="That serial already exists for this part") from exc

            await database.stock_events.insert_one(
                {
                    "part_id": mongo_part_id,
                    "event_group_id": str(uuid4()),
                    "operation": "serialize",
                    "quantity": 1,
                    "from_location_id": location_id,
                    "to_location_id": location_id,
                    "note": f"Serialized as {payload.serial}",
                    "actor": payload.actor,
                    "tracked_unit_id": result.inserted_id,
                    "before_total": float(sum(_alloc_map(part).values(), ZERO)),
                    "after_total": float(sum(_alloc_map(part).values(), ZERO)),
                    "created_at": now,
                },
                session=session,
            )
    return {"id": str(result.inserted_id)}


async def update_tracked_unit(part_id: str, unit_id: str, payload) -> dict:
    """Update a serialized unit; moving its location also moves one aggregate stock unit atomically."""
    database = get_db()
    client = get_client()
    mongo_part_id = oid(part_id, "part id")
    mongo_unit_id = oid(unit_id, "tracked unit id")
    now = utcnow()

    async with await client.start_session() as session:
        async with session.start_transaction():
            unit = await database.tracked_units.find_one(
                {"_id": mongo_unit_id, "part_id": mongo_part_id}, session=session
            )
            if not unit:
                raise HTTPException(status_code=404, detail="Tracked unit not found")

            changes = payload.model_dump(exclude_none=True)
            actor = changes.pop("actor", "Unknown")
            note = changes.pop("note", "Tracked unit updated")
            if "status" in changes:
                changes["status"] = changes["status"].value

            event_operation = "tracked_unit_update"
            old_location = unit.get("location_id")
            new_location = old_location

            if "location_id" in changes:
                new_location = oid(changes["location_id"], "location id")
                location = await database.locations.find_one({"_id": new_location, "active": True}, session=session)
                if not location:
                    raise HTTPException(status_code=400, detail="Location is invalid or inactive")
                changes["location_id"] = new_location

                if new_location != old_location:
                    part = await database.parts.find_one({"_id": mongo_part_id}, session=session)
                    if not part:
                        raise HTTPException(status_code=404, detail="Part not found")
                    allocations = _alloc_map(part)
                    old_key = str(old_location)
                    new_key = str(new_location)
                    if allocations.get(old_key, ZERO) < 1:
                        raise HTTPException(status_code=409, detail="Inventory is inconsistent at tracked unit location")
                    allocations[old_key] -= Decimal(1)
                    allocations[new_key] = allocations.get(new_key, ZERO) + Decimal(1)
                    result = await database.parts.update_one(
                        {"_id": mongo_part_id, "stock_version": part.get("stock_version", 0)},
                        {
                            "$set": {"allocations": _alloc_list(allocations), "updated_at": now},
                            "$inc": {"stock_version": 1},
                        },
                        session=session,
                    )
                    if result.modified_count != 1:
                        raise HTTPException(status_code=409, detail="Stock changed concurrently; refresh and retry")
                    event_operation = "move_tracked_unit"

            changes["updated_at"] = now
            await database.tracked_units.update_one({"_id": mongo_unit_id}, {"$set": changes}, session=session)
            await database.stock_events.insert_one(
                {
                    "part_id": mongo_part_id,
                    "event_group_id": str(uuid4()),
                    "operation": event_operation,
                    "quantity": 1,
                    "from_location_id": old_location,
                    "to_location_id": new_location,
                    "note": note,
                    "actor": actor,
                    "tracked_unit_id": mongo_unit_id,
                    "created_at": now,
                },
                session=session,
            )
    return {"ok": True}


async def retire_tracked_unit(part_id: str, unit_id: str, payload) -> dict:
    """Retire one serialized unit and remove one physical unit from stock atomically."""
    database = get_db()
    client = get_client()
    mongo_part_id = oid(part_id, "part id")
    mongo_unit_id = oid(unit_id, "tracked unit id")
    now = utcnow()

    async with await client.start_session() as session:
        async with session.start_transaction():
            unit = await database.tracked_units.find_one(
                {"_id": mongo_unit_id, "part_id": mongo_part_id}, session=session
            )
            if not unit:
                raise HTTPException(status_code=404, detail="Tracked unit not found")
            if unit.get("status") == "retired":
                raise HTTPException(status_code=409, detail="Tracked unit is already retired")

            part = await database.parts.find_one({"_id": mongo_part_id}, session=session)
            allocations = _alloc_map(part)
            loc_key = str(unit["location_id"])
            if allocations.get(loc_key, ZERO) < 1:
                raise HTTPException(status_code=409, detail="Inventory is inconsistent at tracked unit location")
            before_total = sum(allocations.values(), ZERO)
            allocations[loc_key] -= Decimal(1)

            result = await database.parts.update_one(
                {"_id": mongo_part_id, "stock_version": part.get("stock_version", 0)},
                {
                    "$set": {"allocations": _alloc_list(allocations), "updated_at": now},
                    "$inc": {"stock_version": 1},
                },
                session=session,
            )
            if result.modified_count != 1:
                raise HTTPException(status_code=409, detail="Stock changed concurrently; refresh and retry")

            await database.tracked_units.update_one(
                {"_id": mongo_unit_id},
                {"$set": {"status": "retired", "updated_at": now}},
                session=session,
            )
            await database.stock_events.insert_one(
                {
                    "part_id": mongo_part_id,
                    "event_group_id": str(uuid4()),
                    "operation": "retire_tracked_unit",
                    "quantity": 1,
                    "from_location_id": unit["location_id"],
                    "to_location_id": None,
                    "note": payload.note,
                    "actor": payload.actor,
                    "tracked_unit_id": mongo_unit_id,
                    "before_total": float(before_total),
                    "after_total": float(before_total - Decimal(1)),
                    "created_at": now,
                },
                session=session,
            )
    return {"ok": True}
