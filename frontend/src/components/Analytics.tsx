import {
  ArrowUpRight,
  Download,
  Gauge,
  Timer,
  Layers,
  CheckCheck,
} from "lucide-react";
import type { AreaFilter, Snapshot } from "../data/types";
import {
  clockLabel,
  duration,
  equipmentOee,
  getMetrics,
  percent,
} from "../engine/metrics";
import { KpiCard, PanelTitle, StatusBadge, Timeline } from "./ui";
import { ProductionChart } from "./Charts";

export function Analytics({
  snapshot,
  area,
  onSelect,
}: {
  snapshot: Snapshot;
  area: AreaFilter;
  onSelect: (id: string) => void;
}) {
  const metrics = getMetrics(snapshot, area);
  const exportCsv = () => {
    const rows = [
      [
        "Equipment",
        "Name",
        "Area",
        "Status",
        "Good units",
        "Rejected units",
        "Cycle seconds",
        "Downtime seconds",
        "Queue",
        "Simulated time",
      ],
      ...metrics.machines.map((m) => [
        m.id,
        m.name,
        m.area,
        m.status,
        m.good,
        m.rejected,
        m.cycleTime,
        m.downtime,
        m.queue.length,
        clockLabel(snapshot.elapsed, snapshot.shift),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "allur-equipment-demo.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="analytics-view">
      <div className="kpi-grid">
        <KpiCard
          title="Equipment utilization"
          value={metrics.utilization.toFixed(1)}
          unit="%"
          detail="Processing time / elapsed time"
          icon={<Gauge size={17} />}
        />
        <KpiCard
          title="Unplanned downtime"
          value={duration(metrics.downtime)}
          detail="Cumulative equipment time"
          icon={<Timer size={17} />}
          accent="amber"
        />
        <KpiCard
          title="Work in buffers"
          value={metrics.queue}
          unit="units"
          detail={`Across ${metrics.machines.length} stations`}
          icon={<Layers size={17} />}
        />
        <KpiCard
          title="Output quality"
          value={metrics.quality.toFixed(1)}
          unit="%"
          detail={`${metrics.rejected} units rejected at area exit`}
          icon={<CheckCheck size={17} />}
          accent="green"
        />
      </div>
      <section className="panel analytics-chart">
        <PanelTitle eyebrow="SHIFT PERFORMANCE" title="Production trajectory">
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
        <ProductionChart snapshot={snapshot} area={area} height={210} />
      </section>
      <section className="panel equipment-table-panel">
        <PanelTitle
          eyebrow="EQUIPMENT PERFORMANCE"
          title={area === "All areas" ? "Every station, in detail" : area}
        >
          <button className="secondary-button" onClick={exportCsv}>
            <Download size={14} />
            Export CSV
          </button>
        </PanelTitle>
        <div className="equipment-list">
          {metrics.machines.map((m) => {
            const oee = equipmentOee(m, snapshot.elapsed);
            return (
              <article className="machine-row" key={m.id}>
                <div className="machine-row-heading">
                  <button onClick={() => onSelect(m.id)}>
                    <strong>{m.id}</strong>
                    <ArrowUpRight size={13} />
                  </button>
                  <span>{m.name}</span>
                  <StatusBadge status={m.status} compact />
                </div>
                <Timeline machine={m} snapshot={snapshot} />
                <div className="machine-row-metrics">
                  <div>
                    <span>Cycle / nominal</span>
                    <strong
                      className={
                        m.cycleTime > m.nominalCycle ? "amber-text" : ""
                      }
                    >
                      {m.cycleTime}
                      <small> / {m.nominalCycle} s</small>
                    </strong>
                  </div>
                  <div>
                    <span>OEE</span>
                    <strong>
                      {oee.oee.toFixed(1)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Good units</span>
                    <strong>
                      {m.good}
                      <small> / {m.total} total</small>
                    </strong>
                  </div>
                  <div>
                    <span>Stopped</span>
                    <strong>{duration(m.downtime)}</strong>
                  </div>
                  <div>
                    <span>Waiting / blocked</span>
                    <strong>
                      {duration(m.idleTime)}
                      <small> / {duration(m.blockedTime)}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Utilization</span>
                    <strong>
                      {percent(m.runTime, snapshot.elapsed).toFixed(0)}
                      <small>%</small>
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="method-note">
          OEE = availability × performance × quality. Waiting and blocked time
          reduce performance. Planned time equals elapsed shift time in this
          demo. Area output is measured at its final station.
        </div>
      </section>
    </div>
  );
}
