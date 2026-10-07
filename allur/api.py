"""Local demo API. State is isolated per application and reset on restart."""

from copy import deepcopy
from datetime import date as Date
import json
import os
from pathlib import Path
from threading import RLock
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

from allur.engine import build_dashboard, load_case, simulate
from allur.ml import model_status, predict_risk
from allur.integration import build_state, calculate_stop_scenario

ROOT = Path(__file__).resolve().parents[1]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SectionState(StrictInput):
    id: Literal["welding", "painting", "assembly"]
    status: Literal["running", "warning", "stopped"] = Field(description="Учебный статус агрегированного периода, не телеметрия текущего момента.")
    throughput: float = Field(ge=0, description="Валовой выпуск в авто/час календарного периода: actual_units / scheduled_hours.")
    queue: int | None = Field(default=None, ge=0, description="Очередь в автомобилях; null означает отсутствие данных.")
    downtime_minutes: float = Field(ge=0, description="Сумма событий оборудования участка за выбранную дату, минуты.")
    defect_rate: float = Field(ge=0, le=1, description="Доля брака 0..1, не проценты.")


class StateResponse(StrictInput):
    sections: list[SectionState]


class ScenarioInput(StrictInput):
    date: Date | None = None
    scheduled_hours: float = Field(default=8, ge=1, le=24)
    downtime_reduction_pct: float = Field(default=30, ge=0, le=100)
    defect_reduction_pct: float = Field(default=20, ge=0, le=100)
    capacity_increase_pct: float = Field(default=10, ge=0, le=100)
    working_days: int = Field(default=22, ge=1, le=31)
    shifts_per_day: int = Field(default=2, ge=1, le=3)

    @model_validator(mode="after")
    def feasible_day(self):
        if self.scheduled_hours * self.shifts_per_day > 24:
            raise ValueError("Суммарное время смен не может превышать 24 часа в сутки.")
        return self


class AssistantInput(StrictInput):
    question: str = Field(min_length=1, max_length=1000)
    date: Date | None = None
    scheduled_hours: float = Field(default=8, ge=1, le=24)


class StopScenarioInput(StrictInput):
    id: Literal["welding", "painting", "assembly"]
    date: Date | None = None
    equipment_id: str = Field(min_length=1, max_length=100)
    stop_minutes: float = Field(ge=0, le=1440)
    horizon_minutes: float = Field(default=480, gt=0, le=1440)
    scheduled_hours: float = Field(default=8, ge=1, le=24)

    @model_validator(mode="after")
    def stop_fits_horizon(self):
        if self.stop_minutes > self.horizon_minutes:
            raise ValueError("Остановка не может быть длиннее горизонта сценария.")
        return self


class ProductionRecord(StrictInput):
    date: Date
    line_id: Literal["welding", "painting", "assembly"]
    planned_units: int = Field(ge=1, le=100000)
    actual_units: int = Field(ge=0, le=100000)
    runtime_hours: float = Field(ge=0, le=24)
    utilization_pct: float = Field(ge=0, le=100)
    defects: int = Field(ge=0, le=100000)

    @model_validator(mode="after")
    def consistent_counts(self):
        if self.defects > self.actual_units:
            raise ValueError("Брак не может превышать выпуск.")
        if self.runtime_hours == 0 and self.actual_units > 0:
            raise ValueError("Положительный выпуск требует положительного времени работы.")
        return self


class IngestInput(StrictInput):
    records: list[ProductionRecord] = Field(min_length=1, max_length=3000)

    @model_validator(mode="after")
    def unique_keys(self):
        keys = [(r.date, r.line_id) for r in self.records]
        if len(set(keys)) != len(keys):
            raise ValueError("Повторяются пары дата/линия.")
        return self


class PredictionInput(IngestInput):
    scheduled_hours: float = Field(default=8, ge=1, le=24)
    as_of: Date | None = None


def local_answer(question: str, dashboard: dict) -> dict:
    """Small evidence router, intentionally not an LLM or causal diagnosis."""
    q = question.lower().strip()
    k = dashboard["kpis"]
    lines = dashboard["lines"]
    evidence = [f"Дата: {dashboard['date']}. Источник: тестовые записи/импорт текущего сеанса."]
    if any(word in q for word in ("узк", "бутыл", "bottleneck", "огранич")):
        b = dashboard["bottleneck"]
        answer = f"Текущий кандидат в узкое место — {b['name']}. {b['reason']}"
        evidence += [f"{r['name']}: годный выпуск {r['good_units']}, брак {r['defect_pct']:.2f}%." for r in lines]
        answer += " Проверьте очереди и межоперационные запасы: двух дней недостаточно для доказательства устойчивого ограничения."
    elif any(word in q for word in ("брак", "качеств", "дефект")):
        worst = max(lines, key=lambda r: r["defect_pct"])
        answer = (f"Наибольшая доля брака на участке {worst['name']}: {worst['defect_pct']:.2f}% "
                  f"при пороге {dashboard['targets']['defect_pct']}%. Проверьте журнал дефектов и параметры процесса. "
                  "По этим агрегатам нельзя установить причину брака.")
        evidence += [f"{r['name']}: {r['actual_units'] - r['good_units']} дефектов из {r['actual_units']}." for r in lines]
    elif any(word in q for word in ("план", "месяц", "выпуск", "автомоб")):
        answer = (f"На сборке выпущено {k['final_output']} автомобилей при плане {k['final_plan']}; "
                  f"выполнение {k['plan_attainment_pct']:.2f}%, годных {k['final_good_output']}. "
                  f"Сумма месячных планов по моделям — {k['monthly_plan_sum']}, общий целевой план — {k['monthly_target']}. "
                  "Для месячного сценария задайте рабочие дни и сменность на вкладке сценариев.")
        evidence += ["Выпуск последовательных участков не суммируется.", *dashboard["warnings"]]
    elif any(word in q for word in ("просто", "оборуд", "инцидент", "полом")):
        events = dashboard["downtime"]
        answer = f"За выбранную дату зарегистрировано {k['downtime_minutes']:.0f} минут простоев по всем записям оборудования. "
        if events:
            worst = max(events, key=lambda r: r["duration_minutes"])
            answer += f"Самый длительный эпизод: {worst['equipment']} — {worst['reason']}, {worst['duration_minutes']} минут. "
        answer += "Лимит 60 минут относится к одному критическому агрегату за сутки; критичность в исходнике не указана."
        evidence += [f"{e['equipment']}: {e['duration_minutes']} мин; {e['reason']}." for e in events]
    elif any(word in q for word in ("oee", "эффектив", "загруз", "показател")):
        answer = (f"Оценочный OEE конечной сборки — {k['oee_pct']:.2f}% при цели {dashboard['targets']['oee_pct']}%. "
                  "Это расчёт с идеальным циклом из плана; паспортного идеального цикла в данных нет. "
                  "Изменение длительности периода меняет компоненты OEE. Минуты инцидентов повторно из времени работы не вычитаются.")
        evidence += [f"{r['name']}: A={r['availability_pct']:.2f}%, P={r['performance_pct']:.2f}%, Q={r['quality_pct']:.2f}%." for r in lines]
    elif any(word in q for word in ("прогноз", "риск", "модел", "ии")):
        p = dashboard["prediction"]
        answer = p.get("label", "Прогноз недоступен.") + " " + " ".join(p.get("limitations", []))
        evidence += p.get("drivers", [])
    else:
        answer = ("Я локальный аналитик с ответами по расчётам, а не языковая модель. "
                  "Могу объяснить OEE, брак, выполнение плана, простои, узкое место или ограничения прогноза. "
                  "Например: «Где узкое место?» или «Почему есть отклонение по качеству?»")
    return {"answer": answer, "evidence": evidence, "mode": "local_evidence"}


def create_app(initial_case: dict | None = None) -> FastAPI:
    app = FastAPI(title="Allur Digital Twin", version="1.0.0", docs_url="/docs")
    state = deepcopy(initial_case) if initial_case is not None else load_case()
    lock = RLock()
    app.state.case = state
    app.state.revision = 0
    origins = [s.strip().rstrip("/") for s in os.environ.get("ALLUR_ALLOWED_ORIGINS", "").split(",") if s.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins,
                           allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.middleware("http")
    async def local_guard(request: Request, call_next):
        # Prevent a foreign browser origin from modifying this local demo server.
        if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
            origin = request.headers.get("origin")
            expected = str(request.base_url).rstrip("/")
            if origin and origin.rstrip("/") != expected and origin.rstrip("/") not in origins:
                return JSONResponse(status_code=403, content={"detail": "Запрос с другого сайта отклонён."})
            length = request.headers.get("content-length")
            try:
                if length is not None and int(length) > 2_000_000:
                    return JSONResponse(status_code=413, content={"detail": "Максимальный размер JSON — 2 МБ."})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Некорректный Content-Length."})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def snapshot():
        with lock:
            return deepcopy(state)

    def dashboard(selected: Date | None, hours: float):
        data = snapshot()
        try:
            result = build_dashboard(data, selected.isoformat() if selected else None, hours)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        # Historical replay must never leak records after the selected date.
        history = [r for r in data["production"] if r["date"] <= result["date"]]
        result["history"] = history
        result["source"] = data.get("source", "")
        result["prediction"] = predict_risk(history, scheduled_hours=hours)
        result["model"] = model_status()
        result["revision"] = app.state.revision
        return result

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "1.0.0", "mode": "local_demo", "revision": app.state.revision}

    @app.get("/api/dashboard")
    def get_dashboard(date: Date | None = None, scheduled_hours: Annotated[float, Query(ge=1, le=24, allow_inf_nan=False)] = 8):
        return dashboard(date, scheduled_hours)

    @app.get("/api/model")
    def get_model():
        return model_status()

    @app.get("/state", response_model=StateResponse)
    @app.get("/api/state", response_model=StateResponse)
    def get_state(date: Date | None = None, scheduled_hours: Annotated[float, Query(ge=1, le=24, allow_inf_nan=False)] = 8):
        try:
            return build_state(snapshot(), date.isoformat() if date else None, scheduled_hours)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/scenarios/stop")
    def stop_scenario(body: StopScenarioInput):
        try:
            return calculate_stop_scenario(snapshot(), body.model_dump(mode="json", exclude_none=True))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/data-sources")
    def data_sources():
        path = ROOT / "data" / "external" / "profiles.json"
        if not path.exists():
            return {"sources": [], "available": False}
        result = json.loads(path.read_text(encoding="utf-8"))
        result["available"] = True
        return result

    @app.post("/api/simulate")
    def run_scenario(body: ScenarioInput):
        try:
            values = body.model_dump(mode="json", exclude_none=True)
            return simulate(snapshot(), values)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/predict")
    def predict(body: PredictionInput):
        history = [row.model_dump(mode="json") for row in body.records]
        if body.as_of:
            history = [row for row in history if row["date"] <= body.as_of.isoformat()]
        if not history:
            raise HTTPException(status_code=422, detail="До выбранной даты нет наблюдений.")
        return {"prediction": predict_risk(history, scheduled_hours=body.scheduled_hours), "model": model_status()}

    @app.post("/api/assistant")
    def ask(body: AssistantInput):
        return local_answer(body.question, dashboard(body.date, body.scheduled_hours))

    @app.post("/api/ingest")
    def ingest(body: IngestInput):
        names = {"welding": ("Сварка-1", "Сварка"), "painting": ("Окраска-1", "Окраска"), "assembly": ("Сборка-1", "Сборка")}
        updates = [r.model_dump(mode="json") for r in body.records]
        with lock:
            merged = {(r["date"], r["line_id"]): deepcopy(r) for r in state["production"]}
            for r in updates:
                r["name"], r["section"] = names[r["line_id"]]
                merged[(r["date"], r["line_id"])] = r
            if len(merged) > 10000:
                raise HTTPException(status_code=422, detail="Сеанс ограничен 10 000 записями.")
            # Reject incomplete stage dates: presenting absent stages as zero is misleading.
            for day in {r["date"] for r in updates}:
                if {line for d, line in merged if d == day} != set(names):
                    raise HTTPException(status_code=422, detail=f"Для {day} нужны записи всех трёх линий.")
            state["production"] = sorted(merged.values(), key=lambda r: (r["date"], r["line_id"]))
            state["source"] = "Тестовые данные Allur и JSON-импорт текущего сеанса; импорт не сохраняется после перезапуска."
            app.state.revision += 1
        return {"accepted": len(updates), "revision": app.state.revision, "persistence": "session_only", "message": "Импортированы только производственные показатели. Журнал простоев не изменён."}

    @app.get("/")
    def index():
        return {"service": "Allur AI backend", "version": "1.0.0", "state": "/state", "openapi": "/openapi.json", "docs": "/docs"}
    return app


app = create_app()
