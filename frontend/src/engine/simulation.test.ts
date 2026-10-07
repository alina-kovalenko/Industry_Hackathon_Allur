import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoSnapshot,
  createEmptySnapshot,
  advanceInPlace,
  compareResponse,
  stepSnapshot,
} from "./simulation";
import { DEMO_ELAPSED, SHIFT_SECONDS } from "../data/fixtures";
import { getMetrics, percent, equipmentOee } from "./metrics";
import { createDemoAdapter } from "../data/demoAdapter";

function invariant(s: ReturnType<typeof createDemoSnapshot>) {
  const wip = s.machines.reduce(
    (n, m) => n + m.queue.length + Number(m.activeUnit !== null),
    0,
  );
  assert.equal(
    s.admitted,
    wip + s.machines.at(-1)!.total,
    "Every admitted unit is either in the line or inspected at exit",
  );
  const ids = s.machines.flatMap((m) => [
    ...m.queue,
    ...(m.activeUnit === null ? [] : [m.activeUnit]),
  ]);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "A unit cannot exist at multiple stations",
  );
  for (const m of s.machines) {
    assert.ok(
      m.queue.length <= m.bufferCapacity,
      `${m.id} exceeded its buffer`,
    );
    assert.equal(m.total, m.good + m.rejected);
    assert.equal(
      m.runTime + m.idleTime + m.downtime + m.blockedTime,
      s.elapsed,
      `${m.id} time accounting`,
    );
    assert.ok(Number.isFinite(equipmentOee(m, s.elapsed).oee));
  }
}
for (const scenario of ["normal", "slowdown", "recovery"] as const) {
  test(`${scenario}: unit conservation, bounded buffers and complete time accounting`, () => {
    const s = createEmptySnapshot(scenario);
    for (let t = 0; t < 8; t++) {
      advanceInPlace(s, 3600);
      invariant(s);
    }
  });
}
test("Identical starting data produces identical results", () => {
  const a = createDemoSnapshot("slowdown");
  const b = createDemoSnapshot("slowdown");
  assert.deepEqual(a.machines, b.machines);
  assert.deepEqual(a.trend, b.trend);
  assert.deepEqual(a.incidents, b.incidents);
});
test("Slower paint cycle reduces throughput after buffers empty", () => {
  const normal = advanceInPlace(createDemoSnapshot("normal"), 3600);
  const slow = advanceInPlace(createDemoSnapshot("slowdown"), 3600);
  assert.ok(normal.machines.at(-1)!.good > slow.machines.at(-1)!.good);
  assert.ok(slow.machines.find((m) => m.id === "PNT-02")!.queue.length >= 6);
});
test("Recovery clears the condition automatically after six simulated minutes", () => {
  const s = createDemoSnapshot("recovery");
  assert.equal(s.machines[4].status, "stopped");
  advanceInPlace(s, 241);
  assert.notEqual(s.machines[4].status, "stopped");
  assert.equal(s.incidents[0].conditionActive, false);
  assert.equal(s.incidents[0].state, "resolved");
  assert.equal(s.machines[4].downtime, 360);
});
test("Response forecast preserves its source and restores good output", () => {
  const s = createDemoSnapshot("slowdown");
  const before = structuredClone(s);
  const result = compareResponse(s, 5, 100);
  assert.deepEqual(s, before, "A what-if must not mutate current conditions");
  assert.ok(
    result.response.machines.at(-1)!.good >
      result.baseline.machines.at(-1)!.good,
  );
  invariant(result.response);
  invariant(result.baseline);
});
test("No intervention in a normal line at 100% gives identical outcomes", () => {
  const s = createDemoSnapshot("normal");
  const result = compareResponse(s, 5, 100);
  assert.deepEqual(result.baseline.machines, result.response.machines);
  assert.ok(result.series.every((p) => p.baseline === p.response));
});
test("Acknowledgment changes workflow only and active faults cannot be manually resolved", () => {
  const adapter = createDemoAdapter();
  const before = adapter.getSnapshot();
  adapter.updateIncident(before.incidents[0].id, "acknowledged");
  assert.equal(adapter.getSnapshot().incidents[0].state, "acknowledged");
  assert.equal(adapter.getSnapshot().incidents[0].conditionActive, true);
  assert.deepEqual(adapter.getSnapshot().machines, before.machines);
  adapter.updateIncident(before.incidents[0].id, "resolved");
  assert.equal(adapter.getSnapshot().incidents[0].state, "acknowledged");
  adapter.reset();
  assert.equal(adapter.getSnapshot().elapsed, DEMO_ELAPSED);
  assert.equal(adapter.getSnapshot().incidents[0].state, "new");
  adapter.dispose();
});
test("Stepping is immutable, metrics use the selected exit, and zero denominators are safe", () => {
  const s = createDemoSnapshot();
  const next = stepSnapshot(s, 20);
  assert.equal(s.elapsed, DEMO_ELAPSED);
  assert.equal(next.elapsed, DEMO_ELAPSED + 20);
  assert.equal(getMetrics(s).good, s.machines.at(-1)!.good);
  assert.equal(getMetrics(s, "Paint Shop").good, s.machines[5].good);
  assert.equal(percent(0, 0), 0);
  assert.equal(getMetrics(createEmptySnapshot()).quality, 0);
});
test("Forecast cannot run beyond the shift boundary", () => {
  const s = createDemoSnapshot("normal");
  advanceInPlace(s, SHIFT_SECONDS);
  const forecast = compareResponse(s, 0, 120);
  assert.equal(s.elapsed, SHIFT_SECONDS);
  assert.equal(forecast.horizonMinutes, 0);
  assert.equal(forecast.response.elapsed, SHIFT_SECONDS);
  invariant(s);
});
