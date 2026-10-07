import {
  DEMO_ELAPSED,
  EQUIPMENT,
  SHIFT_SECONDS,
  AREAS,
} from "../data/fixtures";
import type {
  Machine,
  MachineStatus,
  Snapshot,
  Scenario,
  Shift,
  ForecastResult,
} from "../data/types";

export function createEmptySnapshot(
  scenario: Scenario = "slowdown",
  shift: Shift = "day",
): Snapshot {
  let nextUnit = 1;
  const machines: Machine[] = EQUIPMENT.map((definition, index) => ({
    ...definition,
    queue: Array.from({ length: index === 0 ? 6 : 2 }, () => nextUnit++),
    activeUnit: null,
    progress: 0,
    status: "running",
    cycleTime: definition.nominalCycle,
    total: 0,
    good: 0,
    rejected: 0,
    downtime: 0,
    idleTime: 0,
    blockedTime: 0,
    runTime: 0,
    history: [],
    lastUpdated: 0,
  }));
  return {
    machines,
    elapsed: 0,
    shift,
    scenario,
    incidents: [],
    trend: [],
    admitted: nextUnit - 1,
    nextUnit,
    lastArrival: 0,
    faultStart:
      scenario === "recovery" ? DEMO_ELAPSED - 120 : DEMO_ELAPSED - 1200,
    faultEnd: scenario === "recovery" ? DEMO_ELAPSED + 240 : null,
    capacityMultiplier: 1,
    shiftTarget: 320,
    updatedAt: Date.now(),
  };
}

export function conditionActive(s: Snapshot): boolean {
  return (
    s.scenario !== "normal" &&
    s.elapsed >= s.faultStart &&
    (s.faultEnd === null || s.elapsed < s.faultEnd)
  );
}

function recordStatus(machine: Machine, status: MachineStatus, time: number) {
  machine.status = status;
  const last = machine.history.at(-1);
  if (last?.status === status) last.end = time;
  else machine.history.push({ status, start: time - 1, end: time });
  // Keep enough history for an entire eight-hour demonstration shift.
  if (machine.history.length > 1800) machine.history.shift();
}

function captureTrend(s: Snapshot) {
  const areas = Object.fromEntries(
    AREAS.map((area) => {
      const stations = s.machines.filter((m) => m.area === area);
      const last = stations.at(-1)!;
      return [
        area,
        {
          good: last.good,
          total: last.total,
          queue: stations.reduce((n, m) => n + m.queue.length, 0),
        },
      ];
    }),
  ) as Snapshot["trend"][number]["areas"];
  s.trend.push({
    time: s.elapsed,
    good: s.machines.at(-1)!.good,
    target: (s.shiftTarget * s.elapsed) / SHIFT_SECONDS,
    areas,
  });
}

/** Mutates an isolated snapshot. One-second steps retain finite-buffer semantics. */
export function advanceInPlace(
  s: Snapshot,
  seconds: number,
  capture = true,
): Snapshot {
  const until = Math.min(
    SHIFT_SECONDS,
    s.elapsed + Math.max(0, Math.floor(seconds)),
  );
  while (s.elapsed < until) {
    s.elapsed++;
    const fault = conditionActive(s);
    const first = s.machines[0];
    if (
      s.elapsed - s.lastArrival >= 83 &&
      first.queue.length < first.bufferCapacity
    ) {
      first.queue.push(s.nextUnit++);
      s.admitted++;
      s.lastArrival = s.elapsed;
    }
    // Downstream first prevents a part from crossing several stations in one second.
    for (let i = s.machines.length - 1; i >= 0; i--) {
      const machine = s.machines[i];
      const isPaint = machine.id === "PNT-02";
      const warning = isPaint && fault && s.scenario === "slowdown";
      const stopped = isPaint && fault && s.scenario === "recovery";
      machine.cycleTime = Math.round(
        (machine.nominalCycle * (warning ? 1.8 : 1)) /
          (isPaint ? s.capacityMultiplier : 1),
      );
      machine.lastUpdated = s.elapsed;
      if (stopped) {
        machine.downtime++;
        recordStatus(machine, "stopped", s.elapsed);
        continue;
      }
      if (machine.activeUnit === null && machine.queue.length) {
        machine.activeUnit = machine.queue.shift()!;
        machine.progress = 0;
      }
      if (machine.activeUnit === null) {
        machine.idleTime++;
        recordStatus(machine, "idle", s.elapsed);
        continue;
      }
      const downstream = s.machines[i + 1];
      if (
        machine.progress >= machine.cycleTime &&
        downstream &&
        downstream.queue.length >= downstream.bufferCapacity
      ) {
        machine.blockedTime++;
        recordStatus(machine, "blocked", s.elapsed);
        continue;
      }
      machine.progress++;
      machine.runTime++;
      recordStatus(machine, warning ? "warning" : "running", s.elapsed);
      if (
        machine.progress >= machine.cycleTime &&
        (!downstream || downstream.queue.length < downstream.bufferCapacity)
      ) {
        const unit = machine.activeUnit;
        machine.total++;
        // Repeatable final inspection: every 37th admitted unit is rejected.
        const rejected = !downstream && unit % 37 === 0;
        if (rejected) machine.rejected++;
        else machine.good++;
        if (downstream) downstream.queue.push(unit);
        machine.activeUnit = null;
        machine.progress = 0;
      }
    }
    if (fault && !s.incidents.length) {
      const stop = s.scenario === "recovery";
      s.incidents.push({
        id: `INC-${stop ? "0248" : "0247"}`,
        equipmentId: "PNT-02",
        severity: stop ? "critical" : "warning",
        startedAt: s.elapsed,
        title: stop ? "Paint booth stopped" : "Cycle time above nominal",
        symptoms: stop
          ? "PNT-02 is unavailable. Parts collect in the input buffer while downstream stations consume remaining work."
          : "Paint cycle increased from 84 s to 151 s. The input buffer is filling and upstream throughput is constrained.",
        state: "new",
        conditionActive: true,
      });
    }
    for (const incident of s.incidents) {
      if (incident.conditionActive && !fault) {
        incident.conditionActive = false;
        incident.state = "resolved";
      }
    }
    if (capture && s.elapsed % 300 === 0) captureTrend(s);
  }
  s.updatedAt = Date.now();
  return s;
}

export function createDemoSnapshot(
  scenario: Scenario = "slowdown",
  shift: Shift = "day",
): Snapshot {
  const s = createEmptySnapshot(scenario, shift);
  captureTrend(s);
  return advanceInPlace(s, DEMO_ELAPSED);
}

export function stepSnapshot(s: Snapshot, seconds: number): Snapshot {
  return advanceInPlace(structuredClone(s), seconds);
}

/** Forecast from an identical current state; only the response settings change. */
export function compareResponse(
  s: Snapshot,
  repairMinutes: number,
  capacityPercent: number,
  horizonMinutes = 60,
): ForecastResult {
  const baseline = structuredClone(s);
  const response = structuredClone(s);
  if (conditionActive(response))
    response.faultEnd = response.elapsed + repairMinutes * 60;
  response.capacityMultiplier = capacityPercent / 100;
  const startGood = s.machines.at(-1)!.good;
  const series = [{ minutes: 0, baseline: 0, response: 0 }];
  const availableMinutes = Math.min(
    horizonMinutes,
    Math.floor((SHIFT_SECONDS - s.elapsed) / 60),
  );
  for (let minute = 1; minute <= availableMinutes; minute++) {
    advanceInPlace(baseline, 60, false);
    advanceInPlace(response, 60, false);
    if (minute % 5 === 0 || minute === availableMinutes)
      series.push({
        minutes: minute,
        baseline: baseline.machines.at(-1)!.good - startGood,
        response: response.machines.at(-1)!.good - startGood,
      });
  }
  return { baseline, response, series, horizonMinutes: availableMinutes };
}
