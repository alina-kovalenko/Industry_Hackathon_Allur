import { SHIFT_SECONDS } from "../data/fixtures";
import { conditionActive } from "./simulation";
import type {
  AreaFilter,
  Machine,
  PredictionResponse,
  Snapshot,
} from "../data/types";

export const percent = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
export const duration = (seconds: number) =>
  seconds < 60
    ? `${Math.round(seconds)}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
export function clockLabel(
  elapsed: number,
  shift: Snapshot["shift"] = "day",
  seconds = false,
) {
  const total = (shift === "day" ? 8 : 16) * 3600 + elapsed;
  return `${String(Math.floor(total / 3600) % 24).padStart(2, "0")}:${String(Math.floor(total / 60) % 60).padStart(2, "0")}${seconds ? `:${String(Math.floor(total % 60)).padStart(2, "0")}` : ""}`;
}
export function equipmentOee(m: Machine, elapsed: number) {
  const available = Math.max(0, elapsed - m.downtime);
  const availability = percent(available, elapsed);
  const performance = Math.min(
    100,
    percent(m.nominalCycle * m.total, available),
  );
  const quality = percent(m.good, m.total);
  return {
    availability,
    performance,
    quality,
    oee: (availability * performance * quality) / 10000,
  };
}
export function getMetrics(s: Snapshot, area: AreaFilter = "All areas") {
  const machines = s.machines.filter(
    (m) => area === "All areas" || m.area === area,
  );
  const output = machines.at(-1)!;
  return {
    machines,
    good: output.good,
    total: output.total,
    rejected: output.rejected,
    attainment: percent(output.good, s.shiftTarget),
    quality: percent(output.good, output.total),
    expectedNow: Math.round((s.shiftTarget * s.elapsed) / SHIFT_SECONDS),
    downtime: machines.reduce((n, m) => n + m.downtime, 0),
    queue: machines.reduce((n, m) => n + m.queue.length, 0),
    running: machines.filter(
      (m) => m.status === "running" || m.status === "warning",
    ).length,
    utilization: percent(
      machines.reduce((n, m) => n + m.runTime, 0),
      machines.length * s.elapsed,
    ),
  };
}
export function bottleneck(s: Snapshot): Machine {
  return [...s.machines].sort((a, b) => {
    const score = (m: Machine) =>
      (m.status === "stopped" ? 10000 : 0) +
      m.cycleTime +
      (m.queue.length / m.bufferCapacity) * 20;
    return score(b) - score(a);
  })[0];
}
export function predictRisk(s: Snapshot, m: Machine): PredictionResponse {
  const affected = m.id === "PNT-02" && conditionActive(s);
  return {
    equipmentId: m.id,
    source: "demo-rule",
    condition: affected
      ? "Continued restriction of production flow"
      : "Flow interruption from queue pressure",
    horizonMinutes: 30,
    level: affected
      ? "high"
      : m.queue.length / m.bufferCapacity >= 0.8
        ? "elevated"
        : "low",
    factors: [
      `Cycle time ${m.cycleTime} s · nominal ${m.nominalCycle} s`,
      `Input buffer ${m.queue.length}/${m.bufferCapacity} units`,
      `${duration(m.downtime)} observed unplanned downtime`,
    ],
    generatedAt: s.elapsed,
  };
}
