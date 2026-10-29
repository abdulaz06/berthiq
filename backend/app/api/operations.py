from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Header

from app.api.dependencies import Db, ready_dataset
from app.db.models import Event
from app.schemas.common import KpiValue
from app.schemas.operations import (
    OperationalBerth,
    OperationalEvent,
    OperationalVessel,
    PortOperations,
)
from app.services.ingestion import port_config, timestamp
from app.services.prediction import STAGES

router = APIRouter(tags=["port operations"])


@router.get("/ports/khalifa/geography")
def geography():
    path = Path(__file__).resolve().parents[2] / "data" / "geo" / "khalifa.geojson"
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/datasets/{dataset_id}/operations", response_model=PortOperations)
def operations(
    dataset_id: str, db: Db, x_demo_session: Annotated[uuid.UUID | None, Header()] = None
):
    dataset = ready_dataset(db, dataset_id, x_demo_session)
    cfg = port_config()
    events = list(
        db.scalars(
            sa.select(Event)
            .where(Event.dataset_id == dataset.id)
            .order_by(Event.case_id, Event.seq)
        )
    )
    end = dataset.time_range_end
    if not events or end is None:
        from fastapi import HTTPException

        raise HTTPException(422, "This dataset has no operational events to replay.")
    start = end - timedelta(hours=48)
    grouped: dict[str, list[Event]] = defaultdict(list)
    for e in events:
        grouped[e.case_id].append(e)
    vessels = []
    for cid, evs in grouped.items():
        if evs[-1].end_ts < start:
            continue
        attrs = {k: v for e in evs for k, v in e.attributes.items()}
        vessels.append(
            OperationalVessel(
                case_id=cid,
                vessel_type=attrs.get("vessel_type", "unknown"),
                loa=attrs.get("loa"),
                draft=attrs.get("draft"),
                berth=attrs.get("berth"),
                service_window_start=timestamp(attrs.get("service_window_start")),
                service_window_end=timestamp(attrs.get("service_window_end")),
                events=[
                    OperationalEvent(
                        case_id=cid,
                        activity=e.activity,
                        start=e.start_ts,
                        end=e.end_ts,
                        resource=e.resource_id,
                        status=e.status,
                    )
                    for e in evs
                ],
            )
        )
    # Configured operational berth markers are schematic, NOT surveyed geography.
    coordinates = [([54.6438 + 0.0022 * i, 24.8050 - 0.0018 * i]) for i in range(8)]
    active = sum(not any(e.activity == STAGES[-1] for e in evs) for evs in grouped.values())
    return PortOperations(
        dataset_id=dataset_id,
        port_name=cfg["display_name"],
        clock_start=start,
        clock_end=end,
        berths=[
            OperationalBerth(**b, longitude=pos[0], latitude=pos[1])
            for b, pos in zip(cfg["berths"], coordinates, strict=True)
        ],
        vessels=vessels,
        metrics={
            "active_calls": KpiValue(value=active, unit="calls", provenance="observed"),
            "event_count": KpiValue(value=len(events), unit="events", provenance="observed"),
        },
        geography_disclosure="Berths are schematic approximations, not surveyed geometry.",
        operations_disclosure="Synthetic replay. Vessel positions are simulated, not live AIS.",
        occupancy_assumption_minutes=cfg["durations_minutes"]["berth_occupancy"]["mean"],
    )
