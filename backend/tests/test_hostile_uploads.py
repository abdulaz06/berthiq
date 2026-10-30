from __future__ import annotations

import io
import zipfile

import pytest
from app.services.ingestion import MAX_BYTES, normalize, parse_upload, suggest_mapping
from openpyxl import Workbook


def workbook_with_xml(replacement: bytes) -> bytes:
    stream = io.BytesIO()
    wb = Workbook()
    wb.active.append(["case_id", "activity", "end_ts"])
    wb.active.append(["C1", "Start", "2026-01-01"])
    wb.save(stream)
    output = io.BytesIO()
    with zipfile.ZipFile(stream) as source, zipfile.ZipFile(output, "w") as target:
        for name in source.namelist():
            target.writestr(
                name, replacement if name == "xl/worksheets/sheet1.xml" else source.read(name)
            )
    return output.getvalue()


@pytest.mark.parametrize(
    "content",
    [
        b"a\n\xff",
        b'a\n"unterminated',
        b"a\nwith\x00nul",
        b"a\n" + b"x" * 10_001,
        b"a\n" + b"x" * MAX_BYTES,
        (",".join(f"c{i}" for i in range(65)) + "\n1").encode(),
        b"a\n" + b"x\n" * 50_001,
    ],
)
def test_csv_encoding_quoting_bytes_dimensions_and_cell_limits(content):
    with pytest.raises(ValueError):
        parse_upload(content, "input.csv")


def test_zip_expansion_is_rejected_before_xml_parsing():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", b"0" * (31 * 1024 * 1024))
    assert len(stream.getvalue()) < MAX_BYTES
    with pytest.raises(ValueError, match="expands"):
        parse_upload(stream.getvalue(), "bomb.xlsx")


@pytest.mark.parametrize(
    "xml",
    [
        b"<worksheet><unclosed>",
        b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><worksheet>&x;</worksheet>',
        b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        b'<dimension ref="A1:XFD1048576"/><sheetData/></worksheet>',
    ],
)
def test_malformed_entities_and_forged_dimensions(xml):
    with pytest.raises(ValueError):
        parse_upload(workbook_with_xml(xml), "attack.xlsx")


def test_deep_json_and_nonfinite_numbers_are_fatal_validation():
    for attrs in ('{"x":' + "[" * 1500 + "0" + "]" * 1500 + "}", '{"loa":NaN}'):
        row = {"case_id": "C1", "activity": "Start", "end_ts": "2026-01-01", "attributes": attrs}
        events, report = normalize([row], suggest_mapping(list(row)), "test")
        assert not events and report.is_blocking
        assert "invalid_attribute" in {issue.code for issue in report.issues}
