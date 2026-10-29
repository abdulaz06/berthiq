from __future__ import annotations

import io
import uuid

import pytest
from app.db.models import Case, DatasetStatus, Event
from app.services.ingestion import (
    apply_mapping,
    create_upload,
    normalize,
    parse_upload,
    suggest_mapping,
)
from openpyxl import Workbook
from sqlalchemy import select


def test_csv_aliases_and_timezone():
    rows = parse_upload(
        b"case,stage,timestamp\nC1,Documents submitted,2026-01-01T12:00:00+04:00\n", "events.csv"
    )
    mapping = suggest_mapping(list(rows[0]))
    events, report = normalize(rows, mapping, "test")
    assert not report.is_blocking
    assert events[0].end_ts.utcoffset().total_seconds() == 4 * 3600


def test_xlsx_matches_csv():
    wb = Workbook()
    wb.active.append(["case_id", "activity", "end_ts"])
    wb.active.append(["C1", "Start", "2026-01-01T00:00:00Z"])
    stream = io.BytesIO()
    wb.save(stream)
    expected = parse_upload(b"case_id,activity,end_ts\nC1,Start,2026-01-01T00:00:00Z\n", "a.csv")
    assert parse_upload(stream.getvalue(), "a.xlsx") == expected


@pytest.mark.parametrize(
    "content,name",
    [(b"a,a\n1,2", "a.csv"), (b"bad", "a.exe"), (b"a,b\n", "empty.csv"), (b"bad zip", "a.xlsx")],
)
def test_bad_upload_rejected(content, name):
    with pytest.raises(ValueError):
        parse_upload(content, name)


def test_validation_distinguishes_fatal_and_warnings():
    rows = [
        {
            "case_id": "C",
            "activity": "A",
            "start_ts": "2026-01-03",
            "end_ts": "2026-01-02",
            "resource_id": "unknown",
        },
        {
            "case_id": "C",
            "activity": "A",
            "start_ts": "2026-01-03",
            "end_ts": "2026-01-02",
            "resource_id": "unknown",
        },
        {"case_id": "C", "activity": "B", "end_ts": "2026-01-01"},
        {"case_id": "", "activity": "B", "end_ts": "2026-01-01"},
        {"case_id": "D", "activity": "B", "end_ts": "bad"},
    ]
    events, report = normalize(rows, suggest_mapping(list(rows[0])), "test")
    assert report.is_blocking
    codes = {i.code: i.severity for i in report.issues}
    assert codes["missing_required"] == codes["invalid_timestamp"] == "fatal"
    for warning in ["negative_duration", "duplicate_event", "impossible_order", "unknown_resource"]:
        assert codes[warning] == "warning"
    assert len(events) == 2
    assert events[0].end_ts < events[1].end_ts


def test_persistence_immutable_versions_and_fatal_atomicity(session):
    owner = uuid.uuid4()
    rows = parse_upload(b"case_id,activity,end_ts\nC1,Start,2026-01-01T00:00:00Z\n", "a.csv")
    first = create_upload(session, rows, "first", owner)
    report = apply_mapping(session, first, suggest_mapping(list(rows[0])))
    assert not report.is_blocking
    assert first.status == DatasetStatus.ready
    assert session.scalar(select(Event)).case_id == "C1"
    assert session.scalar(select(Case)).is_active
    assert "raw_rows" not in first.stats
    with pytest.raises(ValueError, match="immutable"):
        apply_mapping(session, first, suggest_mapping(list(rows[0])))
    rows[0]["end_ts"] = "invalid"
    second = create_upload(session, rows, "second", owner)
    assert second.id != first.id
    report = apply_mapping(session, second, suggest_mapping(list(rows[0])))
    assert report.is_blocking
    assert not list(session.scalars(select(Event).where(Event.dataset_id == second.id)))
