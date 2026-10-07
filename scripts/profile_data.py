"""Create source-by-source summaries without combining incompatible grains."""
from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "external" / "raw"


def numeric(rows, key):
    vals = []
    for row in rows:
        try:
            vals.append(float(row[key]))
        except (KeyError, TypeError, ValueError):
            pass
    return vals


def summarize(vals):
    if not vals:
        return None
    return {"mean": round(statistics.mean(vals), 4), "min": round(min(vals), 4), "max": round(max(vals), 4)}


def run():
    with (RAW / "mfg005_synthetic_line_performance.csv").open(newline="", encoding="utf-8-sig") as f:
        hf = list(csv.DictReader(f))
    with (RAW / "clay_OEEdataset.csv").open(newline="", encoding="utf-8-sig") as f:
        clay_pre = list(csv.DictReader(f))
    with (RAW / "clay_OEEdataset_afterLSS.csv").open(newline="", encoding="utf-8-sig") as f:
        clay_post = list(csv.DictReader(f))
    with (RAW / "clay_DowntimeDataset.csv").open(newline="", encoding="utf-8-sig") as f:
        clay_events = list(csv.DictReader(f))
    with (RAW / "clay_DowntimeDataset_afterLSS.csv").open(newline="", encoding="utf-8-sig") as f:
        clay_events_after = list(csv.DictReader(f))
    wb = load_workbook(RAW / "automotive_visual_inspection.xlsx", read_only=True, data_only=True)
    summary = list(wb["Summary"].values)
    oee = [float(row[i]) for row in summary if row[1] == "OEE" for i in range(2, 8) if isinstance(row[i], (int, float))]
    downtime = [float(row[i]) for row in summary if row[1] == "Downtime (min)" for i in range(2, 8) if isinstance(row[i], (int, float))]
    cpk = [float(row[i]) for row in summary if row[1] == "Cpk" for i in range(2, 8) if isinstance(row[i], (int, float))]
    result = {
        "created_by": "scripts/profile_data.py",
        "sources": [
            {"id": "xpertsystems/mfg005-sample", "grain": "synthetic shift x line", "rows": len(hf),
             "lines": len({r["line_id"] for r in hf}), "date_min": min(r["shift_date"] for r in hf),
             "date_max": max(r["shift_date"] for r in hf),
             "unplanned_downtime_positive_pct": round(100 * sum(float(r["downtime_unplanned_minutes"]) > 0 for r in hf) / len(hf), 2),
             "oee_pct": summarize([100 * float(r["oee_overall"]) for r in hf]), "license": "CC-BY-NC-4.0"},
            {"id": "Zenodo 17855209 clay", "grain": "whole-line production shift", "before_oee_rows": len(clay_pre),
             "after_lss_oee_rows": len(clay_post), "before_oee_fraction": summarize(numeric(clay_pre, "OEE")),
             "after_lss_oee_fraction": summarize(numeric(clay_post, "OEE")), "before_downtime_event_rows": len(clay_events),
             "after_lss_downtime_event_rows": len(clay_events_after),
             "license": "CC-BY-4.0"},
            {"id": "Zenodo 17649175 automotive inspection", "grain": "monthly aggregate", "months": len(oee),
             "oee_pct": summarize(oee), "downtime_minutes": summarize(downtime), "cpk": summarize(cpk),
             "license": "CC-BY-4.0"},
        ],
        "pooling": "Sources remain separate: synthetic shift-line observations, real heavy-clay line shifts/events, and automotive monthly aggregates are different populations and temporal grains.",
    }
    out = ROOT / "data" / "external" / "profiles.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
