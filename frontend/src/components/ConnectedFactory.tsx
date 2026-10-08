import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Factory, Gauge, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { KpiCard, PanelTitle } from "./ui";
import { PredictionSummary, type ModelPrediction } from "./PredictionSummary";
import { sessionEpochDecision, shouldAcceptHistory } from "../data/sessionOrdering";
import "../connected.css";

type Section = { id: string; status: string; throughput: number; queue: number | null; downtime_minutes: number; defect_rate: number };
type State = { sections: Section[] };
type ScenarioResult = {
  before: { state: State; modeled_good_units: number };
  after: { state: State; modeled_good_units: number };
  lost_good_units: number; explanation: string;
  bottleneck: { after: { name: string; reason: string } };
  threshold: { exceeded: boolean; projected_minutes: number; limit_minutes: number };
};
type Dashboard = { kpis: { final_output: number; final_good_output: number; oee_pct: number; defect_pct: number }; prediction: ModelPrediction; downtime: { equipment: string; reason: string; duration_minutes: number }[] };
type Session = { session_id: string; revision: number; date: string; state: State; scenario: ScenarioResult | null; replay: { running: boolean }; observed_dashboard: Dashboard };
type Event = { id: number; kind: string; timestamp: string; date: string; result?: ScenarioResult };
const names: Record<string, string> = { welding: "Сварка", painting: "Окраска", assembly: "Сборка" };
const equipment: Record<string, string> = { welding: "ABB-01", painting: "Камера-02", assembly: "Конвейер-03" };
const statuses: Record<string, string> = { running: "Работает", warning: "Отклонение", stopped: "Остановлен" };
const kinds: Record<string, string> = { scenario: "Сценарий остановки", reset: "Сброс", replay_started: "Воспроизведение запущено", replay_stopped: "Воспроизведение остановлено", replay_frame: "Новый тестовый срез", ingest: "Импорт данных" };
const number = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((e: { msg: string }) => e.msg).join("; ") : data.detail;
    throw new Error(detail || `Ошибка сервера: ${response.status}`);
  }
  return data;
}

export function ConnectedFactory() {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("painting");
  const [minutes, setMinutes] = useState(60);
  const [interval, setIntervalSeconds] = useState(3);
  const [syncedAt, setSyncedAt] = useState(0);
  const pollGeneration = useRef(0);
  const historyRevision = useRef(-1);
  const activeSessionId = useRef("");
  const activeEpochRequest = useRef(0);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestSequence = ++refreshSequence.current;
    const [next, history] = await Promise.all([
      api<Session>("session", { signal }),
      api<{ events: Event[]; revision: number; session_id: string }>("history?limit=20", { signal }),
    ]);
    const epochDecision = sessionEpochDecision(activeSessionId.current, activeEpochRequest.current, next.session_id, requestSequence);
    if (epochDecision === "stale") return;
    if (epochDecision === "new") {
      activeSessionId.current = next.session_id;
      activeEpochRequest.current = requestSequence;
      historyRevision.current = -1;
      setEvents([]);
    }
    setSession(previous => !previous || previous.session_id !== next.session_id || next.revision >= previous.revision ? next : previous);
    if (shouldAcceptHistory(history.session_id, activeSessionId.current, history.revision, historyRevision.current)) {
      historyRevision.current = history.revision;
      setEvents(history.events);
    }
    setSyncedAt(Date.now());
  }, []);

  useEffect(() => {
    const generation = ++pollGeneration.current;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        await refresh(controller.signal);
        if (pollGeneration.current === generation) setConnectionError("");
      } catch {
        if (pollGeneration.current === generation) setConnectionError("Нет связи с сервером. Показывается последний полученный срез; повторяем запрос.");
      } finally {
        clearTimeout(timeout);
        if (pollGeneration.current === generation) timer = setTimeout(poll, 1000);
      }
    }
    void poll();
    return () => { ++pollGeneration.current; clearTimeout(timer); controller?.abort(); };
  }, [refresh]);

  async function action(path: string, body = {}) {
    setBusy(true);
    setActionError("");
    try {
      await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      await refresh(AbortSignal.timeout(15000));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Запрос не выполнен");
    } finally { setBusy(false); }
  }

  const result = session?.scenario;
  const kpis = session?.observed_dashboard.kpis;
  const error = actionError || connectionError;
  return <div className="connected-view">
    <div className="case-toolbar">
      <div><span className={`dot ${error ? "muted-dot" : ""}`} /><strong>{session ? `Тестовый срез · ${session.date}` : "Подключение к серверу…"}</strong>
        <small>{syncedAt ? `Получен в ${new Date(syncedAt).toLocaleTimeString("ru-RU")} · версия ${session?.revision}` : "Ожидаем ответ API"}</small></div>
      <div className="case-actions">
        <label>Интервал <select aria-label="Интервал воспроизведения" value={interval} onChange={e => setIntervalSeconds(Number(e.target.value))}><option value={3}>3 с</option><option value={5}>5 с</option><option value={10}>10 с</option></select></label>
        <button className="secondary-button" disabled={busy || !session} onClick={() => void action(session?.replay.running ? "replay/stop" : "replay/start", { interval_seconds: interval, loop: true })}>
          {session?.replay.running ? <Pause size={15} /> : <Play size={15} />}{session?.replay.running ? "Пауза" : "Воспроизвести данные"}</button>
        <button className="secondary-button" disabled={busy || !session} onClick={() => void action("reset")}><RotateCcw size={15} />Сбросить сценарий</button>
      </div>
    </div>
    {error && <div className="case-error" role="alert">{error}</div>}
    <p className="case-note">Тестовые данные кейса за 1–2 октября 2026 года. Воспроизведение меняет срезы, запросы обновляют экран каждую секунду. Подключения к оборудованию нет.</p>
    {kpis && <div className="kpi-grid">
      <KpiCard title="Фактический выпуск сборки" value={number(kpis.final_output)} unit="авто" detail={`${number(kpis.final_good_output)} годных · выбранный период`} icon={<Factory size={17} />} />
      <KpiCard title="Оценочный OEE сборки" value={number(kpis.oee_pct)} unit="%" detail="Цель 85% · идеальный цикл оценён из плана" icon={<Gauge size={17} />} />
      <KpiCard title="Брак на сборке" value={number(kpis.defect_pct)} unit="%" detail="Допустимый уровень — 2%" icon={<Activity size={17} />} />
      <KpiCard title="Потеря в сценарии" value={result ? number(result.lost_good_units) : "—"} unit="авто" detail="Модельный годный выпуск за горизонт 8 часов" icon={<Timer size={17} />} accent="amber" />
    </div>}
    <section className="panel case-lines">
      <PanelTitle eyebrow={result ? "ПРОЕКЦИЯ СЦЕНАРИЯ" : "НАБЛЮДАЕМЫЕ ДАННЫЕ"} title="Состояние производственной линии" />
      <div className="case-line-grid">
        {session?.state.sections.map((s, index) => <article className={`case-line ${s.status}`} key={s.id} data-testid={`section-${s.id}`}>
          <div className="case-line-head"><span>0{index + 1} / {s.id}</span><span className="case-status">{statuses[s.status]}</span></div>
          <h3>{names[s.id]}</h3><strong className="case-throughput">{number(s.throughput)} <small>авто/ч</small></strong>
          <dl><div><dt>Простой</dt><dd>{number(s.downtime_minutes)} мин</dd></div><div><dt>Брак</dt><dd>{number(s.defect_rate * 100)}%</dd></div><div><dt>Очередь</dt><dd>{s.queue === null ? "Нет данных" : `${s.queue} авто`}</dd></div></dl>
        </article>)}
      </div>
      {!session && <p className="case-note">Запусти backend и дождись соединения. Состояние линии не подменяется случайными данными.</p>}
    </section>
    <div className="case-two-columns">
      <section className="panel case-scenario">
        <PanelTitle eyebrow="FRONTEND → API → РАСЧЁТЫ" title="Остановка участка" />
        <form onSubmit={e => { e.preventDefault(); void action("scenarios/run", { id: section, equipment_id: equipment[section], date: session?.date, stop_minutes: minutes, horizon_minutes: 480, scheduled_hours: 8 }); }}>
          <label>Участок<select aria-label="Участок остановки" value={section} onChange={e => setSection(e.target.value)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Длительность остановки, мин<input aria-label="Длительность остановки" type="number" min={0} max={480} step={1} required value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
          <button className="primary-button" type="submit" disabled={busy || !session}>{busy ? "Выполняется…" : "Запустить сценарий"}</button>
        </form>
        <p className="case-note">Горизонт — 480 минут. Каждый запуск заменяет предыдущий сценарий на исходном срезе и приостанавливает воспроизведение.</p>
        {result && <div className="case-result" aria-live="polite">
          <div className="case-comparison"><div><span>Модель · до</span><strong>{number(result.before.modeled_good_units)}</strong></div><div><span>Модель · после</span><strong>{number(result.after.modeled_good_units)}</strong></div></div>
          <p>{result.explanation}</p><p><b>Кандидат в узкое место: {result.bottleneck.after.name}.</b> {result.bottleneck.after.reason}</p>
          <p className={result.threshold.exceeded ? "case-threshold" : ""}>Простой выбранного оборудования за день: {number(result.threshold.projected_minutes)} мин / порог {result.threshold.limit_minutes} мин. {result.threshold.exceeded ? "Порог превышен." : "Порог не превышен."} Критичность оборудования не указана в источнике.</p>
        </div>}
      </section>
      <section className="panel case-history">
        <PanelTitle eyebrow="СОХРАНЯЕТСЯ ДО ПЕРЕЗАПУСКА СЕРВЕРА" title="История событий" />
        {!events.length && <p className="case-note">Сценарии, воспроизведение и сброс появятся здесь.</p>}
        <ol>{[...events].reverse().map(event => <li key={event.id}><details><summary><strong>{kinds[event.kind] || event.kind}</strong><span>{event.date} · #{event.id}</span></summary>
          <p>{new Date(event.timestamp).toLocaleTimeString("ru-RU")}</p>{event.result && <p>{event.result.explanation}</p>}</details></li>)}</ol>
      </section>
    </div>
    {session && <section className="panel case-insights"><PanelTitle eyebrow="ИЗ РАСЧЁТНОГО МОДУЛЯ" title="Инциденты и прогноз" />
      {session.observed_dashboard.downtime.map((d, i) => <p key={i}><b>{d.equipment}</b> · {d.reason} · {d.duration_minutes} мин</p>)}
      {!session.observed_dashboard.downtime.length && <p>За выбранную дату инциденты в журнале отсутствуют.</p>}
      <PredictionSummary prediction={session.observed_dashboard.prediction} date={session.date} />
    </section>}
  </div>;
}
