"""Pydantic request models for the PURPL inventory API."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Specification(StrictModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=1000)
    unit: str | None = Field(default=None, max_length=40)


class PartCreate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    manufacturer_part_number: str | None = Field(default=None, max_length=200)
    purpl_part_number: str | None = Field(default=None, max_length=200)
    category_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    specifications: list[Specification] = Field(default_factory=list)
    stock_unit: str = Field(default="each", min_length=1, max_length=40)
    image_url: str | None = Field(default=None, max_length=2000)


class PartUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    manufacturer_part_number: str | None = Field(default=None, max_length=200)
    purpl_part_number: str | None = Field(default=None, max_length=200)
    category_id: str | None = None
    tags: list[str] | None = None
    specifications: list[Specification] | None = None
    stock_unit: str | None = Field(default=None, min_length=1, max_length=40)
    image_url: str | None = Field(default=None, max_length=2000)
    archived: bool | None = None


class StockAllocationEdit(StrictModel):
    location_id: str
    new_quantity: float = Field(ge=0)
    note: str = Field(min_length=1, max_length=2000)


class StockReconcileRequest(StrictModel):
    actor: str = Field(default="Unknown", min_length=1, max_length=150)
    edits: list[StockAllocationEdit] = Field(min_length=1, max_length=100)


class NameCreate(StrictModel):
    name: str = Field(min_length=1, max_length=150)


class LocationState(str, Enum):
    available = "available"
    in_use = "in_use"
    unavailable = "unavailable"


class LocationCreate(NameCreate):
    state: LocationState = LocationState.available
    description: str = Field(default="", max_length=1000)


class LocationUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    state: LocationState | None = None
    description: str | None = Field(default=None, max_length=1000)
    active: bool | None = None


class NoteCreate(StrictModel):
    text: str = Field(min_length=1, max_length=5000)
    author: str = Field(default="Unknown", min_length=1, max_length=150)


class RelationCreate(StrictModel):
    related_part_id: str
    relationship: str = Field(default="related", min_length=1, max_length=100)
    note: str = Field(default="", max_length=1000)


class StockOperationType(str, Enum):
    receive = "receive"
    move = "move"
    remove = "remove"
    adjust = "adjust"


class StockChange(StrictModel):
    operation: StockOperationType
    quantity: float = Field(gt=0)
    from_location_id: str | None = None
    to_location_id: str | None = None
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("quantity")
    @classmethod
    def reasonable_precision(cls, value: float) -> float:
        return round(value, 6)


class StockBatchRequest(StrictModel):
    actor: str = Field(default="Unknown", min_length=1, max_length=150)
    changes: list[StockChange] = Field(min_length=1, max_length=100)


class TrackedUnitStatus(str, Enum):
    active = "active"
    damaged = "damaged"
    lost = "lost"
    retired = "retired"


class TrackedUnitCreate(StrictModel):
    serial: str = Field(min_length=1, max_length=200)
    location_id: str
    status: TrackedUnitStatus = TrackedUnitStatus.active
    description: str = Field(default="", max_length=5000)
    kit: str | None = Field(default=None, max_length=200)
    actor: str = Field(default="Unknown", min_length=1, max_length=150)


class TrackedUnitUpdate(StrictModel):
    location_id: str | None = None
    status: TrackedUnitStatus | None = None
    description: str | None = Field(default=None, max_length=5000)
    kit: str | None = Field(default=None, max_length=200)
    actor: str = Field(default="Unknown", min_length=1, max_length=150)
    note: str = Field(default="Tracked unit updated", min_length=1, max_length=2000)


class TrackedUnitRetire(StrictModel):
    actor: str = Field(default="Unknown", min_length=1, max_length=150)
    note: str = Field(default="Tracked unit removed from inventory", min_length=1, max_length=2000)


class AttachmentMetadata(StrictModel):
    note: str = Field(default="", max_length=2000)
    uploaded_by: str = Field(default="Unknown", min_length=1, max_length=150)


class AttachmentKind(str, Enum):
    datasheet = "datasheet"
    service_manual = "service_manual"
    drawing = "drawing"
    photo = "photo"
    other = "other"
