import { AllurLogo } from "./components/AllurLogo";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Beaker,
  Box,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  Factory,
  Gauge,
  Layers3,
  Menu,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Target,
  Timer,
  X,
} from "lucide-react";
import { createDemoAdapter } from "./data/demoAdapter";
import { AREAS, SCENARIOS, SHIFT_SECONDS } from "./data/fixtures";
import type { AreaFilter, IncidentState, Scenario, Shift } from "./data/types";
import { bottleneck, clockLabel, duration, getMetrics } from "./engine/metrics";
import { FactoryMap } from "./components/FactoryMap";
import { EquipmentPanel } from "./components/EquipmentPanel";
import { KpiCard, PanelTitle } from "./components/ui";
import { ProductionChart } from "./components/Charts";
import { IncidentList } from "./components/IncidentList";
import { Analytics } from "./components/Analytics";
import { ScenarioLab } from "./components/ScenarioLab";
import { ConnectedFactory } from "./components/ConnectedFactory";

type View = "backend" | "overview" | "analytics" | "scenarios";
const VIEWS = [
  { id: "backend" as const, name: "Данные сервера", icon: Radio, short: "Case data" },
  {
    id: "overview" as const,
    name: "Factory overview",
    icon: Layers3,
    short: "Overview",
  },
  {
    id: "analytics" as const,
    name: "Line analytics",
    icon: BarChart3,
    short: "Analytics",
  },
  {
    id: "scenarios" as const,
    name: "Scenario lab",
    icon: Beaker,
    short: "Scenarios",
  },
];

export default function App() {
  const [adapter] = useState(createDemoAdapter);
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const [view, setView] = useState<View>("backend");
  const [area, setArea] = useState<AreaFilter>("All areas");
  const [selected, setSelected] = useState<string | null>("PNT-02");
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const helpRef = useRef<HTMLDialogElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (menu && mobile) menuCloseRef.current?.focus();
  }, [menu, mobile]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    adapter.setPaused(paused || view === "backend");
  }, [adapter, paused, view]);
  useEffect(() => {
    if (help) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [help]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const metrics = getMetrics(snapshot, area);
  const machine = snapshot.machines.find((m) => m.id === selected);
  const constraint = bottleneck(snapshot);
  const shiftEnded = snapshot.elapsed >= SHIFT_SECONDS;
  const age = Math.max(0, Math.floor((now - snapshot.updatedAt) / 1000));
  const stale = !paused && !shiftEnded && age > 5;
  const activeIncidents = snapshot.incidents.filter(
    (i) => i.conditionActive,
  ).length;
  const navigate = (target: View) => {
    setView(target);
    setMenu(false);
    setExpanded(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const selectMachine = (id: string) => {
    const m = snapshot.machines.find((m) => m.id === id)!;
    if (area !== "All areas" && area !== m.area) setArea("All areas");
    setSelected(id);
    navigate("overview");
  };
  const updateIncident = (id: string, state: IncidentState) => {
    adapter.updateIncident(id, state);
    setToast(
      state === "acknowledged"
        ? `${id} acknowledged. Equipment condition remains active.`
        : `${id} marked as investigating.`,
    );
  };
  const changeArea = (value: AreaFilter) => {
    setArea(value);
    if (value !== "All areas" && machine?.area !== value)
      setSelected(snapshot.machines.find((m) => m.area === value)!.id);
  };
  const reset = () => {
    adapter.reset();
    setPaused(false);
    setToast("Simulation reset to the initial demonstration snapshot.");
  };
  return (
    <div className={`app-shell ${menu ? "menu-open" : ""}`}>
      <aside className="sidebar" inert={mobile && !menu}>
        <button
          ref={menuCloseRef}
          className="sidebar-close icon-button"
          aria-label="Close navigation menu"
          onClick={() => setMenu(false)}
        >
          <X size={16} />
        </button>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Allur home"
        >
          <span className="brand-avatar">
            <AllurLogo />
          </span>
          <span className="brand-caption">
            <strong>FACTORY</strong>
            <small>INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE<span>01</span>
        </div>
        <nav aria-label="Main navigation">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {view === item.id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-separator" />
        <div className="sidebar-factory">
          <div className="factory-icon">
            <Factory size={21} />
          </div>
          <span>
            Allur production plant<small>Kostanay, Kazakhstan</small>
          </span>
        </div>
        <div className="sidebar-bottom">
          <div className="system-card">
            <div>
              <span className="dot" />
              CASE DATA & SIMULATOR
            </div>
            <p>
              One factory.
              <br />A connected perspective.
            </p>
            <div className="system-line">
              <span>3 case sections · 12 demo stations</span>
              <Radio size={13} />
            </div>
          </div>
          <button
            ref={helpTrigger}
            className="help-button"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
            Demo guide & definitions
            <ArrowUpRight size={13} />
          </button>
          <div className="user-card">
            <span className="avatar">OP</span>
            <div>
              Operations workspace<small>Demonstration access</small>
            </div>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-shell" inert={mobile && menu}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <Factory size={16} />
            <span>Allur plant</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{VIEWS.find((v) => v.id === view)?.short}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <Box size={11} />
              DEMO DATA
            </span>
            <span className={`connection-status ${stale ? "stale" : ""}`}>
              <span
                className={`dot ${paused || shiftEnded ? "muted-dot" : ""}`}
              />
              {view === "backend" ? "Server data view" : shiftEnded
                ? "Shift completed"
                : paused
                  ? "Simulation paused"
                  : stale
                    ? "Data delayed"
                    : "Engine connected"}
            </span>
            <span className="topbar-divider" />
            <button
              className="notification-button"
              aria-label={`View ${activeIncidents} active incidents`}
              onClick={() => {
                navigate("overview");
                setTimeout(
                  () =>
                    document
                      .getElementById("incidents")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  80,
                );
              }}
            >
              <Bell size={18} />
              {activeIncidents > 0 && <i />}
            </button>
            <span className="small-avatar">OP</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                PRODUCTION INTELLIGENCE <span>/</span> ALLUR CASE
              </div>
              <h1>
                {view === "backend" ? "Линия, связанная с сервером." : view === "overview"
                  ? "Your factory. In focus."
                  : view === "analytics"
                    ? "Behind every production line."
                    : "See the impact. Before it happens."}
              </h1>
              <p>
                {view === "backend" ? "Тестовые срезы, расчёты остановки и история — в одном интерфейсе." : view === "overview"
                  ? "A connected view of production, performance, and what needs your attention."
                  : view === "analytics"
                    ? "Understand the performance of each station, from cycle time to quality."
                    : "Explore production decisions with a transparent, repeatable simulation."}
              </p>
            </div>
            {view !== "backend" && <div className="shift-clock">
              <span>SIMULATED SHIFT TIME</span>
              <strong>
                {clockLabel(snapshot.elapsed, snapshot.shift, true)}
              </strong>
              <small>UTC+5 · 10× simulation speed</small>
            </div>}
          </div>
          {view !== "backend" && <div className="controls-bar">
            <div className="view-filters">
              <label className="select-wrap">
                <Factory size={14} />
                <select
                  aria-label="Production area"
                  value={area}
                  onChange={(e) => changeArea(e.target.value as AreaFilter)}
                  disabled={view === "scenarios"}
                >
                  <option>All areas</option>
                  {AREAS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="select-wrap">
                <Clock3 size={14} />
                <select
                  aria-label="Shift"
                  value={snapshot.shift}
                  onChange={(e) => adapter.setShift(e.target.value as Shift)}
                >
                  <option value="day">Shift A · 08:00–16:00</option>
                  <option value="evening">Shift B · 16:00–00:00</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="demo-controls">
              <label className="select-wrap scenario-select">
                <Beaker size={14} />
                <select
                  aria-label="Demo scenario"
                  value={snapshot.scenario}
                  onChange={(e) => {
                    adapter.setScenario(e.target.value as Scenario);
                    setSelected("PNT-02");
                    setArea("All areas");
                    setToast(SCENARIOS[e.target.value as Scenario].description);
                  }}
                >
                  <option value="normal">Normal production</option>
                  <option value="slowdown">Paint station slowdown</option>
                  <option value="recovery">Stop & recovery</option>
                </select>
                <ChevronDown size={13} />
              </label>
              <button
                className={`icon-button control-button ${paused ? "active" : ""}`}
                aria-label={paused ? "Resume simulation" : "Pause simulation"}
                title={paused ? "Resume simulation" : "Pause simulation"}
                onClick={() => setPaused((p) => !p)}
                disabled={shiftEnded}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                className="icon-button control-button"
                aria-label="Reset simulation"
                title="Reset simulation"
                onClick={reset}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>}
          {view === "backend" && <ConnectedFactory />}
          {view !== "backend" && stale && (
            <div className="stale-banner" role="status">
              Data has not updated for {age} seconds. Showing the last available
              snapshot.
            </div>
          )}
          {view === "overview" && (
            <div className="overview-view">
              <div className="kpi-grid">
                <KpiCard
                  title={
                    area === "All areas"
                      ? "Good vehicles produced"
                      : "Good units at area exit"
                  }
                  value={metrics.good.toLocaleString()}
                  unit="units"
                  detail={`Shift target · ${snapshot.shiftTarget} good units`}
                  icon={<Factory size={17} />}
                >
                  <span className="metric-chip">
                    {metrics.good >= metrics.expectedNow ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}
                    {metrics.good - metrics.expectedNow >= 0 ? "+" : ""}
                    {metrics.good - metrics.expectedNow} vs pace
                  </span>
                </KpiCard>
                <KpiCard
                  title="Plan attainment"
                  value={metrics.attainment.toFixed(1)}
                  unit="%"
                  detail={`${((snapshot.elapsed / SHIFT_SECONDS) * 100).toFixed(0)}% of shift elapsed`}
                  icon={<Target size={17} />}
                >
                  <div className="mini-progress">
                    <i
                      style={{ width: `${Math.min(100, metrics.attainment)}%` }}
                    />
                  </div>
                </KpiCard>
                <KpiCard
                  title="Unplanned downtime"
                  value={duration(metrics.downtime)}
                  detail="Cumulative equipment time"
                  icon={<Timer size={17} />}
                  accent="amber"
                >
                  <span className="metric-chip amber-chip">
                    {activeIncidents} active incident
                    {activeIncidents !== 1 ? "s" : ""}
                  </span>
                </KpiCard>
                <KpiCard
                  title="Output quality"
                  value={metrics.quality.toFixed(1)}
                  unit="%"
                  detail={`${metrics.rejected} rejected / ${metrics.total} inspected`}
                  icon={<CheckCheck size={17} />}
                  accent="green"
                >
                  <span className="quality-bars">
                    {Array.from({ length: 10 }, (_, i) => (
                      <i
                        key={i}
                        style={{ opacity: i < metrics.quality / 10 ? 1 : 0.2 }}
                      />
                    ))}
                  </span>
                </KpiCard>
              </div>
              <div
                className={`overview-main ${!machine || expanded ? "wide-map" : ""}`}
              >
                <FactoryMap
                  snapshot={snapshot}
                  selected={selected}
                  onSelect={(id) => {
                    const target = snapshot.machines.find((m) => m.id === id)!;
                    if (area !== "All areas" && area !== target.area) {
                      setArea("All areas");
                    }
                    setSelected(id);
                  }}
                  area={area}
                  paused={paused || shiftEnded}
                  expanded={expanded}
                  onExpand={() => setExpanded(!expanded)}
                />
                {machine && !expanded && (
                  <EquipmentPanel
                    machine={machine}
                    snapshot={snapshot}
                    paused={paused || shiftEnded}
                    onCompare={() => navigate("scenarios")}
                    onClose={() => setSelected(null)}
                  />
                )}
              </div>
              {!machine && (
                <div className="inspector-hint">
                  <Cpu size={15} />
                  Select a station on the map to inspect its performance and
                  risk indicators.
                </div>
              )}
              <div className="overview-bottom">
                <section className="panel production-panel">
                  <PanelTitle
                    eyebrow="ACTUAL VS PLANNED"
                    title="Production, over time"
                  >
                    <div className="chart-key">
                      <span>
                        <i />
                        Good units
                      </span>
                      <span>
                        <i className="plan" />
                        Plan to time
                      </span>
                    </div>
                  </PanelTitle>
                  <ProductionChart snapshot={snapshot} area={area} />
                  <div className="chart-footer">
                    <span>
                      <Clock3 size={12} />
                      {snapshot.shift === "day"
                        ? "08:00–16:00"
                        : "16:00–00:00"}{" "}
                      · selected shift
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("analytics")}
                    >
                      View analytics
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </section>
                <IncidentList
                  snapshot={snapshot}
                  area={area}
                  onSelect={selectMachine}
                  onUpdate={updateIncident}
                />
              </div>
              <section
                className="area-strip"
                aria-label="Production area summary"
              >
                {AREAS.map((a) => {
                  const m = getMetrics(snapshot, a);
                  return (
                    <button
                      key={a}
                      className={area === a ? "active" : ""}
                      onClick={() => changeArea(area === a ? "All areas" : a)}
                    >
                      <div>
                        <span>{a}</span>
                        <ArrowUpRight size={12} />
                      </div>
                      <strong>
                        {m.good}
                        <small>good units</small>
                      </strong>
                      <span className="area-strip-bottom">
                        <i
                          className={
                            m.machines.some(
                              (m) =>
                                m.status === "stopped" ||
                                m.status === "warning",
                            )
                              ? "warning"
                              : ""
                          }
                        />
                        {m.running} / {m.machines.length} processing
                        <span>{m.queue} queued</span>
                      </span>
                    </button>
                  );
                })}
              </section>
              <div className="constraint-note">
                <Gauge size={14} />
                <strong>Current constraint: {constraint.id}</strong>
                <span>
                  {constraint.status === "stopped"
                    ? "Equipment is stopped."
                    : `${constraint.cycleTime}s cycle with ${constraint.queue.length}/${constraint.bufferCapacity} units in its input buffer.`}{" "}
                  Estimate uses cycle time, queue pressure, and stop status.
                </span>
              </div>
            </div>
          )}
          {view === "analytics" && (
            <Analytics
              snapshot={snapshot}
              area={area}
              onSelect={selectMachine}
            />
          )}
          {view === "scenarios" && <ScenarioLab snapshot={snapshot} />}
          <footer className="app-footer">
            <span>
              <Activity size={12} />
              ALLUR / FACTORY INTELLIGENCE <i /> Prototype
            </span>
            <span>
              {view === "backend" ? "Case data from backend · polling every second" : paused
                ? "Simulation paused"
                : shiftEnded
                  ? "Shift complete"
                  : `Updated ${age}s ago`}{" "}
              <i />
              Illustrative data · no equipment connection
            </span>
          </footer>
          <div className="brand-attribution">
            Авторство: Allur.{" "}
            <a
              href="https://allur.kz/"
              rel="nofollow noreferrer"
              target="_blank"
            >
              allur.kz
            </a>{" "}
            ·{" "}
            <a
              href="http://creativecommons.org/publicdomain/zero/1.0/deed.en"
              rel="noreferrer"
              target="_blank"
              title="Creative Commons Zero, Public Domain Dedication"
            >
              CC0
            </a>{" "}
            ·{" "}
            <a
              href="https://commons.wikimedia.org/w/index.php?curid=150018122"
              rel="noreferrer"
              target="_blank"
            >
              Ссылка
            </a>
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={16} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        ref={helpRef}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onClose={() => {
          setHelp(false);
          helpTrigger.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <span className="eyebrow">WELCOME TO ALLUR</span>
          <button
            className="icon-button"
            aria-label="Close demo guide"
            onClick={() => setHelp(false)}
          >
            <X size={18} />
          </button>
        </div>
        <h2>A factory you can explore.</h2>
        <p>
          The «Данные сервера» page uses the Python backend, case records and
          the team's calculation module. The other pages show a separate
          illustrative simulation. One
          second of real time advances ten seconds of production.
        </p>
        <ol>
          <li>
            <strong>Choose a scenario.</strong> Watch queues and machine states
            change together.
          </li>
          <li>
            <strong>Inspect an alert.</strong> Open its equipment details and
            compare cycle time with nominal.
          </li>
          <li>
            <strong>Acknowledge the incident.</strong> This records review; it
            does not clear the equipment condition.
          </li>
          <li>
            <strong>Explore a response.</strong> Adjust restoration time and
            capacity in Scenario Lab.
          </li>
        </ol>
        <div className="guide-definitions">
          <h3>How to read the numbers</h3>
          <p>
            <b>Good units</b> are measured at the selected area’s last station.
            Factory output uses QC-03.
          </p>
          <p>
            <b>Plan attainment</b> is good output divided by the full shift
            target. The pace comparison uses the target proportional to elapsed
            time.
          </p>
          <p>
            <b>Downtime</b> sums stopped equipment seconds. Waiting and blocked
            time appear separately in analytics.
          </p>
          <p>
            <b>Quality</b> is good output / total processed at the selected
            area’s exit.
          </p>
          <p>
            <b>Risk</b> is an explainable rule-based demo estimate, not a
            trained AI model.
          </p>
        </div>
        <button className="primary-button" onClick={() => setHelp(false)}>
          Explore the factory
          <ArrowUpRight size={15} />
        </button>
      </dialog>
    </div>
  );
}
