"""Thread-safe demonstration session; observed records remain separate from scenarios."""
from copy import deepcopy
from datetime import datetime, timezone
from threading import RLock
import time

from allur.integration import build_state, calculate_stop_scenario

NAMES = {"welding": "Сварка", "painting": "Окраска", "assembly": "Сборка"}


class LineSession:
    def __init__(self, case, *, clock=time.monotonic):
        self.original = deepcopy(case)
        self.case = deepcopy(case)
        self.lock = RLock()
        self.clock = clock
        self.revision = 0
        self.events = []
        self.event_id = 0
        self.date = self.dates()[-1]
        self.hours = 8
        self.scenario = None
        self.replay_running = False
        self.interval = 3.0
        self.loop = True
        self.deadline = None

    def dates(self):
        return sorted({r["date"] for r in self.case["production"]})

    def _record(self, kind, **values):
        self.revision += 1
        self.event_id += 1
        self.events.append({"id": self.event_id, "kind": kind,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "revision": self.revision, "date": self.date, **deepcopy(values)})
        del self.events[:-500]

    def _tick(self):
        if not self.replay_running or self.clock() < self.deadline:
            return
        dates = self.dates()
        steps = int((self.clock() - self.deadline) // self.interval) + 1
        index = dates.index(self.date) + steps
        if self.loop:
            index %= len(dates)
        else:
            index = min(index, len(dates) - 1)
            if index == len(dates) - 1:
                self.replay_running = False
        self.date = dates[index]
        self.scenario = None
        self.deadline += steps * self.interval
        self._record("replay_frame", elapsed_frames=steps)

    def _state(self):
        return deepcopy(self.scenario["after"]["state"]) if self.scenario else build_state(self.case, self.date, self.hours)

    def current_state(self):
        with self.lock:
            self._tick()
            return self._state()

    def capture(self):
        with self.lock:
            self._tick()
            return deepcopy(self.case), self.revision, self.date, self.hours

    def metadata(self):
        with self.lock:
            self._tick()
            return {"revision": self.revision, "date": self.date, "scheduled_hours": self.hours,
                    "available_dates": self.dates(), "state": self._state(),
                    "scenario": deepcopy(self.scenario),
                    "replay": {"running": self.replay_running, "interval_seconds": self.interval,
                               "loop": self.loop}, "history_count": len(self.events),
                    "persistence": "session_only"}

    def history(self, limit=50, after_id=0):
        with self.lock:
            self._tick()
            events = [e for e in self.events if e["id"] > after_id]
            return {"events": deepcopy(events[-limit:]), "revision": self.revision,
                    "latest_id": self.event_id, "retained": len(self.events)}

    def apply(self, payload):
        with self.lock:
            self._tick()
            payload = {**payload, "date": payload.get("date", self.date),
                       "scheduled_hours": payload.get("scheduled_hours", self.hours)}
            result = calculate_stop_scenario(self.case, payload)
            before = build_state(self.case, result["date"], result["scheduled_hours"])
            after = deepcopy(before)
            for section, base, projected in zip(after["sections"], result["baseline"]["stages"], result["scenario"]["stages"]):
                # Apply the model's relative flow loss to the recorded period rate.
                # A zero stop therefore preserves every recorded KPI exactly.
                factor = projected["processed_units"] / base["processed_units"] if base["processed_units"] else 1.0
                section["throughput"] *= factor
                if section["id"] == result["id"]:
                    section["downtime_minutes"] += result["stop_minutes"]
                if section["id"] == result["id"] and result["stop_minutes"] == result["horizon_minutes"]:
                    section["throughput"] = 0
                    section["status"] = "stopped"
                elif factor == 0 and result["stop_minutes"] > 0:
                    section["status"] = "stopped"
                elif factor < 1 or (section["id"] == result["id"] and result["stop_minutes"] > 0):
                    section["status"] = "warning"

            qualities = {s["id"]: 1 - s["defect_rate"] for s in before["sections"]}
            def constraint(stages):
                stage = min(stages, key=lambda s: s["effective_capacity_units"] * qualities[s["id"]])
                return {"id": stage["id"], "name": NAMES[stage["id"]],
                        "reason": "Минимальная собственная мощность годного выпуска; очереди и запасы неизвестны."}
            result.update({
                "before": {"state": before, "modeled_good_units": result["baseline"]["good_units"]},
                "after": {"state": after, "modeled_good_units": result["scenario"]["good_units"]},
                "bottleneck": {"before": constraint(result["baseline"]["stages"]),
                               "after": constraint(result["scenario"]["stages"])},
                "explanation": (f"Остановка участка «{NAMES[result['id']]}» на {result['stop_minutes']:g} мин. "
                                f"Модельный годный выпуск: {result['baseline']['good_units']:.2f} → "
                                f"{result['scenario']['good_units']:.2f}; потеря {result['lost_good_units']:.2f}. "
                                "Состояние отображает относительное снижение потока по модели. "
                                "Это гипотетическая оценка без межоперационных запасов, а не фактический выпуск."),
                "mode": "hypothetical_projection",
                "replacement_policy": "Each run replaces the previous scenario on the selected observed date.",
            })
            # Commit only after the entire calculation and validation succeed.
            self.date, self.hours = result["date"], result["scheduled_hours"]
            self.replay_running = False
            self.scenario = result
            self._record("scenario", result=result)
            return {**deepcopy(result), "revision": self.revision}

    def reset(self):
        with self.lock:
            self.case.clear()
            self.case.update(deepcopy(self.original))
            self.date, self.hours = self.dates()[-1], 8
            self.scenario = None
            self.replay_running = False
            self.deadline = None
            self._record("reset")
            return self.metadata()

    def start_replay(self, interval_seconds=3, loop=True, date=None):
        with self.lock:
            selected = date or self.dates()[0]
            if selected not in self.dates():
                raise ValueError("Нет полного тестового среза для выбранной даты.")
            self.date, self.hours = selected, 8
            self.scenario = None
            self.interval, self.loop = interval_seconds, loop
            self.replay_running = True
            self.deadline = self.clock() + interval_seconds
            self._record("replay_started")
            return self.metadata()

    def stop_replay(self):
        with self.lock:
            self._tick()
            self.replay_running = False
            self._record("replay_stopped")
            return self.metadata()

    def ingested(self, accepted):
        # Caller holds the same RLock while committing imported records.
        self.scenario = None
        self.replay_running = False
        self.date = self.dates()[-1]
        self._record("ingest", accepted=accepted)
