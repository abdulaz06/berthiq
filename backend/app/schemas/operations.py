from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import KpiValue


class OperationalEvent(BaseModel):
    case_id: str
    activity: str
    start: datetime | None
    end: datetime
    resource: str | None
    status: str | None


class OperationalVessel(BaseModel):
    case_id: str
    vessel_type: str
    loa: float | None
    draft: float | None
    berth: str | None
    service_window_start: datetime | None
    service_window_end: datetime | None
    events: list[OperationalEvent]


class OperationalBerth(BaseModel):
    id: str
    name: str
    terminal_type: str
    length_m: float
    draft_m: float
    longitude: float
    latitude: float


class PortOperations(BaseModel):
    dataset_id: str
    port_name: str
    clock_start: datetime
    clock_end: datetime
    berths: list[OperationalBerth]
    vessels: list[OperationalVessel]
    metrics: dict[str, KpiValue]
    geography_disclosure: str
    operations_disclosure: str
    occupancy_assumption_minutes: int
