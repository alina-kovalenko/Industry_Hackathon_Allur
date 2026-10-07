import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Activity,
  CirclePause,
  CircleStop,
  CircleHelp,
  WifiOff,
  Timer,
} from "lucide-react";
import type { MachineStatus, Snapshot, Machine } from "../data/types";
import { clockLabel, duration } from "../engine/metrics";

export const STATUS_COLORS: Record<MachineStatus, string> = {
  running: "#43e3a0",
  warning: "#ffbe55",
  stopped: "#ff4d58",
  idle: "#80a9f5",
  blocked: "#ba9bff",
  offline: "#858591",
};
export const STATUS_LABELS: Record<MachineStatus, string> = {
  running: "Running",
  warning: "Slow cycle",
  stopped: "Stopped",
  idle: "Waiting",
  blocked: "Blocked",
  offline: "Offline",
};
const STATUS_ICONS = {
  running: Activity,
  warning: Timer,
  stopped: CircleStop,
  idle: CirclePause,
  blocked: CirclePause,
  offline: WifiOff,
};
export function StatusBadge({
  status,
  compact = false,
}: {
  status: MachineStatus;
  compact?: boolean;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={`status-badge ${compact ? "compact" : ""}`}
      style={{
        color: STATUS_COLORS[status],
        background: `${STATUS_COLORS[status]}12`,
      }}
    >
      <Icon size={12} />
      {STATUS_LABELS[status]}
    </span>
  );
}
export function PanelTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function KpiCard({
  title,
  value,
  unit,
  detail,
  icon,
  accent = "cyan",
  children,
}: {
  title: string;
  value: ReactNode;
  unit?: string;
  detail: string;
  icon: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <article className={`kpi-card ${accent}`}>
      <div className="kpi-top">
        <span>{title}</span>
        {icon}
      </div>
      <div className="kpi-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="kpi-bottom">
        <span>{detail}</span>
        {children ?? <ArrowUpRight size={15} />}
      </div>
    </article>
  );
}
export function Timeline({
  machine,
  snapshot,
}: {
  machine: Machine;
  snapshot: Snapshot;
}) {
  const start = Math.max(0, snapshot.elapsed - 3600);
  const segments = machine.history.filter((s) => s.end > start);
  return (
    <div className="timeline-container">
      <div
        className="status-timeline"
        role="img"
        aria-label={`Last hour of ${machine.id} status`}
      >
        {segments.map((s, i) => (
          <div
            key={`${s.start}-${i}`}
            style={{
              flex: Math.max(1, s.end - Math.max(s.start, start)),
              background: STATUS_COLORS[s.status],
            }}
            title={`${STATUS_LABELS[s.status]} · ${clockLabel(Math.max(s.start, start), snapshot.shift)}–${clockLabel(s.end, snapshot.shift)} · ${duration(s.end - Math.max(s.start, start))}`}
          />
        ))}
      </div>
      <div className="timeline-labels">
        <span>{clockLabel(start, snapshot.shift)}</span>
        <span>Last 60 min</span>
        <span>{clockLabel(snapshot.elapsed, snapshot.shift)}</span>
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CircleHelp size={24} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
