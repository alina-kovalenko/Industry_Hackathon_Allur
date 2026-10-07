"""Deterministic calculations for the Allur case-study dashboard and simulator."""

from __future__ import annotations

from collections import defaultdict
from datetime import date as date_type
import json
import math
from pathlib import Path
from typing import Any


_LINE_ORDER = ("welding", "painting", "assembly")
_DEFAULT_CASE_DIR = Path(__file__).resolve().parents[1] / "data" / "case"


def load_case(data_dir: Path | None = None) -> dict:
    """Load the explicitly transcribed, small case dataset from JSON."""
    path = (Path(data_dir) if data_dir is not None else _DEFAULT_CASE_DIR) / "case.json"
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def _finite_number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"{name} must be between {low:g} and {high:g}")
    return number


def _records_for_date(case: dict, selected: str) -> list[dict]:
    return [row for row in case.get("production", []) if row.get("date") == selected]


def _validated_date(value: str) -> str:
    try:
        parsed = date_type.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("date must be an ISO date (YYYY-MM-DD)") from exc
    if parsed.isoformat() != value:
        raise ValueError("date must be an ISO date (YYYY-MM-DD)")
    return value


def _bounded_pct(value: float, warnings: list[str], label: str) -> float:
    if value > 100:
        warnings.append(f"{label}: расчетное значение выше 100%; компонент OEE ограничен 100%.")
    return min(100.0, max(0.0, value))


def _line_name(case: dict, line_id: str) -> str:
    for row in case.get("production", []):
        if row.get("line_id") == line_id:
            return row.get("name", line_id)
    return line_id


def build_dashboard(case: dict, date: str | None = None, scheduled_hours: float = 8.0) -> dict:
    """Build a dated snapshot. Downtime is displayed as an event log, not runtime subtraction."""
    scheduled = _finite_number(scheduled_hours, "scheduled_hours", 0.01, 24.0)
    available_dates = sorted({row["date"] for row in case.get("production", [])})
    if not available_dates:
        raise ValueError("case has no production dates")
    selected = _validated_date(date) if date is not None else available_dates[-1]
    rows = _records_for_date(case, selected)
    if not rows:
        raise ValueError(f"no production records for {selected}")
    by_line = {row["line_id"]: row for row in rows}
    missing_lines = set(_LINE_ORDER) - set(by_line)
    if missing_lines:
        raise ValueError(f"production date {selected} is missing line records: {', '.join(sorted(missing_lines))}")
    downtime = [dict(row) for row in case.get("downtime", []) if row.get("date") == selected]
    targets = dict(case.get("targets", {}))
    warnings: list[str] = []
    assumptions = [
        "Запись за дату рассматривается как один отчетный производственный интервал; длительности работы близки к 8 часам.",
        "В кейсе одновременно указаны 2 смены по 8 часов. Неясно, охватывают ли записи обе смены; для OEE использовано заданное scheduled_hours (по умолчанию 8), а не 16 часов.",
        "Простой показан как отдельные события и не вычитается повторно из runtime_hours.",
        "Итоговый выпуск и брак для KPI взяты по сборке; суммы выпуска разных последовательных линий не складываются.",
        "OEE — прокси из плана, факта и runtime_hours, без подтвержденного идеального цикла оборудования.",
        "Критичность оборудования не указана: порог 60 минут применяется как предварительная проверка по каждому агрегату.",
    ]
    model_sum = sum(float(item["units"]) for item in case.get("monthly_plan", []))
    monthly_target = float(targets.get("monthly_units", 5500))
    if not math.isclose(model_sum, monthly_target):
        warnings.append(f"Сумма месячных планов моделей {model_sum:g} ниже целевого плана {monthly_target:g} автомобилей.")
    if scheduled != 8.0:
        warnings.append(f"Расчеты OEE используют выбранное окно {scheduled:g} ч; исходные записи не уточняют охват смен.")

    # Aggregate equipment stoppages by date and equipment before checking the daily threshold.
    eq_minutes: dict[str, int] = defaultdict(int)
    for event in downtime:
        eq_minutes[event["equipment"]] += int(event["duration_minutes"])
    threshold = float(targets.get("max_equipment_downtime_minutes", 60))
    critical_equipment = {name for name, minutes in eq_minutes.items() if minutes > threshold}
    line_downtime: dict[str, int] = defaultdict(int)
    for event in downtime:
        line_downtime[event["line_id"]] += int(event["duration_minutes"])

    lines: list[dict] = []
    for line_id in _LINE_ORDER:
        row = by_line.get(line_id)
        if row is None:
            continue
        plan = float(row["planned_units"])
        actual = float(row["actual_units"])
        runtime = float(row["runtime_hours"])
        defects = float(row["defects"])
        if plan <= 0 or runtime < 0 or actual < 0 or defects < 0 or defects > actual or (runtime == 0 and actual > 0):
            raise ValueError(f"invalid production values for {line_id}")
        ideal_cycle_hours = scheduled / plan
        availability = _bounded_pct(runtime / scheduled * 100, warnings, f"Доступность {row['name']}") if runtime else 0.0
        performance = _bounded_pct(actual / (runtime / ideal_cycle_hours) * 100, warnings, f"Производительность {row['name']}") if runtime else 0.0
        quality = _bounded_pct((actual - defects) / actual * 100 if actual else 0, warnings, f"Качество {row['name']}")
        oee = availability * performance * quality / 10000
        defect_pct = defects / actual * 100 if actual else 0.0
        down = line_downtime[line_id]
        if any(event["equipment"] in critical_equipment and event["line_id"] == line_id for event in downtime):
            status = "critical"
        elif defect_pct > float(targets.get("defect_pct", 2)) or oee < float(targets.get("oee_pct", 85)):
            status = "warning"
        else:
            status = "normal"
        lines.append({
            "line_id": line_id, "name": row["name"], "actual_units": int(actual),
            "planned_units": int(plan), "good_units": int(actual - defects),
            "runtime_hours": runtime, "utilization_pct": float(row["utilization_pct"]),
            "defect_pct": defect_pct, "availability_pct": availability,
            "performance_pct": performance, "quality_pct": quality,
            "oee_pct": oee, "downtime_minutes": down, "status": status,
        })

    assembly = by_line["assembly"]
    final_output = int(assembly["actual_units"])
    final_good = final_output - int(assembly["defects"])
    final_plan = int(assembly["planned_units"])
    final_defect_pct = (final_output - final_good) / final_output * 100 if final_output else 0.0
    bottleneck_line = min(lines, key=lambda item: item["good_units"])
    bottleneck = {
        "line_id": bottleneck_line["line_id"], "name": bottleneck_line["name"],
        "reason": f"Наименьший годный выпуск участка в выбранном срезе ({bottleneck_line['good_units']} шт.); запасы между этапами неизвестны.",
    }
    incidents: list[dict] = []
    for index, event in enumerate(downtime, start=1):
        eq_total = eq_minutes[event["equipment"]]
        severity = "critical" if eq_total > threshold else ("info" if event["planned"] else "warning")
        incidents.append({
            "id": f"{selected}-{index}", "severity": severity, "line_id": event["line_id"],
            "title": f"{event['equipment']}: {event['reason']}",
            "detail": f"Простой {event['duration_minutes']} мин.; сумма по оборудованию за дату {eq_total} мин.",
        })
    for line in lines:
        if line["defect_pct"] > float(targets.get("defect_pct", 2)):
            incidents.append({
                "id": f"{selected}-{line['line_id']}-quality", "severity": "warning",
                "line_id": line["line_id"], "title": f"Брак выше целевого уровня: {line['name']}",
                "detail": f"{line['defect_pct']:.1f}% при целевом значении не более {float(targets.get('defect_pct', 2)):.1f}%.",
            })
        if line["oee_pct"] < float(targets.get("oee_pct", 85)):
            incidents.append({
                "id": f"{selected}-{line['line_id']}-oee", "severity": "warning",
                "line_id": line["line_id"], "title": f"Прокси OEE ниже цели: {line['name']}",
                "detail": f"{line['oee_pct']:.1f}% при целевом значении не менее {float(targets.get('oee_pct', 85)):.1f}%.",
            })
    for equipment, minutes in eq_minutes.items():
        if minutes > threshold:
            warnings.append(f"Оборудование {equipment}: простой за сутки {minutes} мин. превышает порог {threshold:g} мин.")
    total_downtime = sum(int(event["duration_minutes"]) for event in downtime)
    return {
        "date": selected, "available_dates": available_dates, "assumptions": assumptions,
        "warnings": warnings,
        "kpis": {
            "final_output": final_output, "final_good_output": final_good,
            "final_plan": final_plan, "plan_attainment_pct": final_output / final_plan * 100 if final_plan else 0,
            "oee_pct": next((line["oee_pct"] for line in lines if line["line_id"] == "assembly"), 0),
            "defect_pct": final_defect_pct, "downtime_minutes": total_downtime,
            "monthly_plan_sum": model_sum, "monthly_target": monthly_target,
        },
        "lines": lines, "incidents": incidents, "downtime": downtime,
        "monthly_plan": [dict(item) for item in case.get("monthly_plan", [])],
        "flow": list(case.get("flow", [])), "history": [dict(row) for row in rows],
        "bottleneck": bottleneck, "targets": targets,
    }


def simulate(case: dict, scenario: dict) -> dict:
    """Estimate a constrained serial-line scenario; this is not a causal forecast."""
    scenario = dict(scenario)
    available_dates = sorted({row["date"] for row in case.get("production", [])})
    if not available_dates:
        raise ValueError("case has no production records")
    selected = _validated_date(scenario.get("date", available_dates[-1]))
    rows = _records_for_date(case, selected)
    if not rows:
        raise ValueError(f"no production records for {selected}")
    by_line = {row["line_id"]: row for row in rows}
    if any(key not in by_line for key in _LINE_ORDER):
        raise ValueError("simulation needs welding, painting, and assembly records for the selected date")
    downtime_reduction = _finite_number(scenario.get("downtime_reduction_pct", 0), "downtime_reduction_pct", 0, 100) / 100
    defect_reduction = _finite_number(scenario.get("defect_reduction_pct", 0), "defect_reduction_pct", 0, 100) / 100
    capacity_increase = _finite_number(scenario.get("capacity_increase_pct", 0), "capacity_increase_pct", 0, 100) / 100
    working_days = _finite_number(scenario.get("working_days", 22), "working_days", 1, 31)
    shifts = _finite_number(scenario.get("shifts_per_day", 2), "shifts_per_day", 1, 3)
    if not working_days.is_integer():
        raise ValueError("working_days must be a whole number")
    if not shifts.is_integer():
        raise ValueError("shifts_per_day must be a whole number")
    scheduled = _finite_number(scenario.get("scheduled_hours", 8), "scheduled_hours", 0.01, 24)
    if scheduled * shifts > 24:
        raise ValueError("scheduled_hours multiplied by shifts_per_day must not exceed 24")
    event_minutes: dict[str, int] = defaultdict(int)
    for event in case.get("downtime", []):
        if event.get("date") == selected and not event.get("planned", False):
            event_minutes[event["line_id"]] += int(event["duration_minutes"])
    def stage_quality(row: dict, reduction: float = 0.0) -> float:
        actual = float(row["actual_units"])
        defect_rate = float(row["defects"]) / actual if actual else 0.0
        return 1.0 - defect_rate * (1 - reduction)

    def serial_flow(capacities: dict[str, float], reduction: float = 0.0) -> tuple[float, str]:
        incoming = math.inf
        limiting_line = _LINE_ORDER[0]
        for line in _LINE_ORDER:
            capacity = capacities[line]
            if incoming >= capacity:
                incoming = capacity
                limiting_line = line
            incoming *= stage_quality(by_line[line], reduction)
        return (0.0 if math.isinf(incoming) else incoming), limiting_line

    stage_actual = {line: float(by_line[line]["actual_units"]) for line in _LINE_ORDER}
    serial_baseline, base_stage = serial_flow(stage_actual)
    baseline_daily = serial_baseline * shifts

    projected: dict[str, float] = {}
    for line in _LINE_ORDER:
        row = by_line[line]
        actual = float(row["actual_units"])
        runtime_minutes = float(row["runtime_hours"]) * 60
        # Only unplanned events and unused scheduled time can support the recovery estimate.
        available_minutes = max(scheduled * 60 - runtime_minutes, 0)
        recoverable_units = actual * min(event_minutes[line], available_minutes) / max(runtime_minutes, 1.0)
        downtime_gain = recoverable_units * downtime_reduction
        capacity_gain = actual * capacity_increase
        estimated = actual + downtime_gain + capacity_gain
        capacity_ceiling = max(actual, float(row["planned_units"]) * (1 + capacity_increase))
        projected[line] = min(estimated, capacity_ceiling)
    projected_serial, projected_bottleneck = serial_flow(projected, defect_reduction)
    scenario_daily = projected_serial * shifts

    def section(line: str, amount: float) -> dict:
        return {"line_id": line, "name": by_line[line]["name"], "reason": f"Минимальный расчетный поток участка: {amount:.1f} шт. за отчетный интервал."}

    assumptions = [
        "Каждая запись трактуется как один отчетный интервал, близкий к 8-часовой смене; shifts_per_day линейно масштабирует расчет на сутки.",
        "Последовательный выпуск ограничен минимумом факта (или расчетной мощности) сварки, окраски и сборки; выпуск этапов не суммируется.",
        "Брак учитывается на каждом этапе последовательно; промежуточные запасы и повторная обработка не моделируются.",
        "Сокращение простоя оценивает восстановленные единицы только по незапланированным событиям и доступному времени до scheduled_hours; исходный runtime не корректируется.",
        "Рост мощности и сокращение простоя — сценарные допущения, а не проверенные причинные эффекты или прогноз.",
    ]
    baseline_monthly = baseline_daily * working_days
    scenario_monthly = scenario_daily * working_days
    delta = scenario_monthly - baseline_monthly
    return {
        "baseline": {"daily_good_units": baseline_daily, "monthly_good_units": baseline_monthly, "bottleneck": section(base_stage, serial_baseline)},
        "scenario": {"daily_good_units": scenario_daily, "monthly_good_units": scenario_monthly, "bottleneck": section(projected_bottleneck, projected[projected_bottleneck])},
        "delta": {"monthly_good_units": delta, "percent": delta / baseline_monthly * 100 if baseline_monthly else 0},
        "assumptions": assumptions,
        "recommendations": [
            f"Проверьте пропускную способность участка «{by_line[base_stage]['name']}»: это узкое место по факту в выбранной дате.",
            "Уточните, представляют ли исходные записи одну смену или полный день, прежде чем использовать оценку для планирования.",
        ],
    }
