"""Backend adapters for section-state and equipment-stop scenario DTOs."""

from __future__ import annotations

from datetime import date as date_type
import math
from typing import Any


_LINE_ORDER = ("welding", "painting", "assembly")
STATE_UNITS = {
    "throughput": "gross recorded units per selected calendar-period hour; computed as actual_units / scheduled_hours, not runtime-normalized",
    "queue": "units; null means not provided",
    "downtime_minutes": "recorded event minutes for this line on the selected date; not deducted from runtime",
    "defect_rate": "fraction from 0 to 1",
}


def _number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    result = float(value)
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f"{name} must be between {low:g} and {high:g}")
    return result


def _date(value: str | None, case: dict) -> str:
    dates = sorted({row["date"] for row in case.get("production", [])})
    if not dates:
        raise ValueError("case has no production records")
    selected = dates[-1] if value is None else value
    try:
        parsed = date_type.fromisoformat(selected)
    except (TypeError, ValueError) as exc:
        raise ValueError("date must be an ISO date (YYYY-MM-DD)") from exc
    if parsed.isoformat() != selected:
        raise ValueError("date must be an ISO date (YYYY-MM-DD)")
    return selected


def _day_rows(case: dict, selected: str) -> dict[str, dict]:
    rows = {row["line_id"]: row for row in case.get("production", []) if row.get("date") == selected}
    missing = set(_LINE_ORDER) - set(rows)
    if missing:
        raise ValueError(f"production date {selected} is missing line records: {', '.join(sorted(missing))}")
    return rows


def build_state(case: dict, date: str | None = None, scheduled_hours: float = 8) -> dict:
    """Return the exact ``{sections: [...]}`` response envelope consumed by /state.

    Units and interpretation are documented in :data:`STATE_UNITS`.
    """
    period_hours = _number(scheduled_hours, "scheduled_hours", 0.01, 24)
    selected = _date(date, case)
    rows = _day_rows(case, selected)
    down_by_line = {line: 0 for line in _LINE_ORDER}
    for event in case.get("downtime", []):
        if event.get("date") == selected and event.get("line_id") in down_by_line:
            down_by_line[event["line_id"]] += int(event["duration_minutes"])

    target_defect_rate = float(case.get("targets", {}).get("defect_pct", 2)) / 100
    sections = []
    for line_id in _LINE_ORDER:
        row = rows[line_id]
        actual = float(row["actual_units"])
        runtime = float(row["runtime_hours"])
        defects = float(row["defects"])
        if actual < 0 or defects < 0 or defects > actual or runtime < 0 or (runtime == 0 and actual > 0):
            raise ValueError(f"invalid production values for {line_id}")
        defect_rate = defects / actual if actual else 0.0
        if runtime == 0 and actual == 0:
            status = "stopped"
        elif defect_rate > target_defect_rate or down_by_line[line_id] > 0 or actual < float(row["planned_units"]):
            status = "warning"
        else:
            status = "running"
        sections.append({
            "id": line_id,
            "status": status,
            "throughput": actual / period_hours,
            "queue": None,
            "downtime_minutes": down_by_line[line_id],
            "defect_rate": defect_rate,
        })
    return {"sections": sections}


def calculate_stop_scenario(case: dict, scenario: dict) -> dict:
    """Estimate a buffer-free serial-chain loss from a hypothetical equipment stop."""
    if not isinstance(scenario, dict):
        raise ValueError("scenario must be an object")
    selected = _date(scenario.get("date"), case)
    rows = _day_rows(case, selected)
    scheduled_hours = _number(scenario.get("scheduled_hours", 8), "scheduled_hours", 0.01, 24)
    horizon = _number(scenario.get("horizon_minutes", 480), "horizon_minutes", 1, 1440)
    stop_minutes = _number(scenario.get("stop_minutes"), "stop_minutes", 0, horizon)
    # `id` matches the frontend section-state DTO; accept `line_id` for direct engine callers.
    line_id = scenario.get("id", scenario.get("line_id"))
    if line_id not in _LINE_ORDER:
        raise ValueError("line_id must be welding, painting, or assembly")
    equipment_id = scenario.get("equipment_id")
    if not isinstance(equipment_id, str) or not equipment_id.strip():
        raise ValueError("equipment_id must be a non-empty string")
    equipment_id = equipment_id.strip()

    known_lines = {
        event["line_id"] for event in case.get("downtime", [])
        if event.get("equipment") == equipment_id
    }
    if known_lines and line_id not in known_lines:
        raise ValueError(f"equipment {equipment_id} is recorded on another line")
    prior_minutes = sum(
        int(event["duration_minutes"]) for event in case.get("downtime", [])
        if event.get("date") == selected and event.get("equipment") == equipment_id
    )
    equipment_limit = float(case.get("targets", {}).get("max_equipment_downtime_minutes", 60))

    scale = horizon / (scheduled_hours * 60)
    gross = {line: float(rows[line]["actual_units"]) * scale for line in _LINE_ORDER}

    def quality(row: dict) -> float:
        actual = float(row["actual_units"])
        defects = float(row["defects"])
        if actual < 0 or defects < 0 or defects > actual:
            raise ValueError("invalid production output or defect count")
        return (actual - defects) / actual if actual else 1.0

    def run_chain(capacities: dict[str, float]) -> tuple[float, list[dict]]:
        incoming = math.inf
        stages = []
        for line in _LINE_ORDER:
            processed = capacities[line] if math.isinf(incoming) else min(incoming, capacities[line])
            good = processed * quality(rows[line])
            stages.append({
                "id": line,
                "input_units": None if math.isinf(incoming) else incoming,
                "gross_capacity_units": gross[line],
                "effective_capacity_units": capacities[line],
                "processed_units": processed,
                "good_output_units": good,
            })
            incoming = good
        return incoming, stages

    baseline_good, baseline_stages = run_chain(gross)
    effective = dict(gross)
    effective[line_id] *= 1 - stop_minutes / horizon
    scenario_good, scenario_stages = run_chain(effective)
    projected_minutes = prior_minutes + stop_minutes
    limit = {
        "limit_minutes": equipment_limit,
        "equipment_prior_minutes": prior_minutes,
        "projected_minutes": projected_minutes,
        "exceeded": projected_minutes > equipment_limit,
        "scope": "equipment_per_calendar_day",
    }
    assumptions = [
        "Case totals are scaled uniformly from scheduled_hours to horizon_minutes; this aggregate extrapolation is not a causal or validated forecast.",
        "The hypothetical stop reduces gross capacity on the selected line in proportion to stop_minutes / horizon_minutes.",
        "Serial stages pass only available good units forward; queues, buffers, rework, inventory and event start times are not modeled. Only aggregate capacity loss over the horizon is estimated.",
        "Recorded equipment downtime is not assumed to equal line downtime; prior minutes are matched by equipment_id only.",
        "The source does not identify critical equipment. The 60-minute threshold is reported as an equipment/day screening limit, not as proof that this asset is critical.",
    ]
    if not known_lines:
        assumptions.append("equipment_id is absent from the case downtime log; prior minutes are assumed to be zero and the supplied id/line pairing is hypothetical.")
    return {
        "date": selected,
        "id": line_id,
        "equipment_id": equipment_id,
        "scheduled_hours": scheduled_hours,
        "horizon_minutes": horizon,
        "stop_minutes": stop_minutes,
        "units": "good units over the selected horizon; capacities and flows are fractional estimates",
        "baseline": {"good_units": baseline_good, "stages": baseline_stages},
        "scenario": {"good_units": scenario_good, "stages": scenario_stages},
        "lost_good_units": baseline_good - scenario_good,
        "threshold": limit,
        "assumptions": assumptions,
    }
