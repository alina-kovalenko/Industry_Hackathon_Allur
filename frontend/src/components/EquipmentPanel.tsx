import { EquipmentModel } from "./FactoryMap";
import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  Crosshair,
  Lightbulb,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Machine, Snapshot } from "../data/types";
import {
  clockLabel,
  duration,
  equipmentOee,
  percent,
  predictRisk,
} from "../engine/metrics";
import { StatusBadge, Timeline, STATUS_COLORS, STATUS_LABELS } from "./ui";

export function EquipmentPanel({
  machine,
  snapshot,
  paused,
  onCompare,
  onClose,
}: {
  machine: Machine;
  snapshot: Snapshot;
  paused: boolean;
  onCompare: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const oee = equipmentOee(machine, snapshot.elapsed);
  const prediction = predictRisk(snapshot, machine);
  return (
    <aside
      className="panel equipment-panel"
      aria-label={`${machine.id} equipment details`}
    >
      <div className="equipment-heading">
        <span className="eyebrow">
          <Crosshair size={12} /> EQUIPMENT INSPECTOR
        </span>
        <button
          onClick={onClose}
          className="icon-button"
          aria-label="Close equipment inspector"
        >
          <X size={15} />
        </button>
      </div>
      <div className="equipment-id">
        <div>
          <span className="muted tiny">{machine.area}</span>
          <h2>{machine.id}</h2>
        </div>
        <StatusBadge status={machine.status} />
      </div>
      <p className="equipment-name">{machine.name}</p>
      <EquipmentModel machine={machine} paused={paused} />
      <div className="equipment-tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Status history
        </button>
      </div>
      {tab === "overview" ? (
        <>
          <div className="equipment-metrics">
            <div>
              <span>Cycle time</span>
              <strong
                className={
                  machine.cycleTime > machine.nominalCycle ? "amber-text" : ""
                }
              >
                {machine.cycleTime}
                <small> sec</small>
              </strong>
              <em>Nominal {machine.nominalCycle} sec</em>
            </div>
            <div>
              <span>Good units</span>
              <strong>
                {machine.good}
                <small> units</small>
              </strong>
              <em>{machine.rejected} rejected</em>
            </div>
          </div>
          <div className="buffer-heading">
            <span>Input buffer</span>
            <strong>
              {machine.queue.length}
              <span> / {machine.bufferCapacity}</span>
            </strong>
          </div>
          <div className="buffer-slots">
            {Array.from({ length: machine.bufferCapacity }, (_, i) => (
              <span
                key={i}
                className={i < machine.queue.length ? "filled" : ""}
              />
            ))}
          </div>
          <div className="oee-breakdown">
            <span>
              Equipment effectiveness <small>OEE</small>
            </span>
            <strong>{oee.oee.toFixed(1)}%</strong>
            <div className="oee-bar">
              <i style={{ width: `${oee.oee}%` }} />
            </div>
            <div className="oee-factors">
              <span>
                A <b>{oee.availability.toFixed(0)}%</b>
              </span>
              <span>
                P <b>{oee.performance.toFixed(0)}%</b>
              </span>
              <span>
                Q <b>{oee.quality.toFixed(0)}%</b>
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="history-details">
          <Timeline machine={machine} snapshot={snapshot} />
          <div className="time-summary">
            <span>
              <Clock3 size={13} />
              Stopped<strong>{duration(machine.downtime)}</strong>
            </span>
            <span>
              Waiting<strong>{duration(machine.idleTime)}</strong>
            </span>
            <span>
              Blocked<strong>{duration(machine.blockedTime)}</strong>
            </span>
            <span>
              Utilization
              <strong>
                {percent(machine.runTime, snapshot.elapsed).toFixed(1)}%
              </strong>
            </span>
          </div>
          <div className="history-events">
            {machine.history
              .slice(-4)
              .reverse()
              .map((segment) => (
                <div key={segment.start}>
                  <i style={{ background: STATUS_COLORS[segment.status] }} />
                  <span>{STATUS_LABELS[segment.status]}</span>
                  <time>{clockLabel(segment.start, snapshot.shift, true)}</time>
                </div>
              ))}
          </div>
        </div>
      )}
      <div className={`risk-panel ${prediction.level}`}>
        <div className="risk-heading">
          <Lightbulb size={14} />
          <strong>Demo risk estimate</strong>
          <span>{prediction.level}</span>
        </div>
        <p>{prediction.condition}</p>
        <div className="risk-evidence">
          {prediction.factors.slice(0, 2).map((factor) => (
            <span key={factor}>
              <ChevronRight size={11} />
              {factor}
            </span>
          ))}
        </div>
        <small>
          Rule based · next {prediction.horizonMinutes} min ·{" "}
          {clockLabel(prediction.generatedAt, snapshot.shift)}
        </small>
      </div>
      <button className="primary-button compare-button" onClick={onCompare}>
        Explore a response
        <ArrowUpRight size={15} />
      </button>
      <div className="inspector-foot">
        <ShieldCheck size={12} />
        Illustrative equipment data
        <CircleCheck size={12} />
      </div>
    </aside>
  );
}
