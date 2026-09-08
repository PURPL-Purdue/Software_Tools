"""Serialization and validation helpers shared by routers/services."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from bson import ObjectId
from fastapi import HTTPException


def oid(value: str, field_name: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}") from exc


def clean_key(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def quantity_decimal(value: Any) -> Decimal:
    try:
        quantity = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Quantity must be numeric") from exc
    if not quantity.is_finite():
        raise HTTPException(status_code=400, detail="Quantity must be finite")
    return quantity


def normalize_quantity(value: Any) -> float:
    """Store quantities as numbers while avoiding binary-float arithmetic in business logic."""
    return float(quantity_decimal(value))


def json_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, list):
        return [json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: json_value(v) for k, v in value.items() if k != "_id"} | (
            {"id": str(value["_id"])} if "_id" in value else {}
        )
    return value


def serialize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    return json_value(doc)
