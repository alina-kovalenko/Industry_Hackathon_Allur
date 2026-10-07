import type {
  FactoryDataAdapter,
  IncidentState,
  Scenario,
  Shift,
  Snapshot,
} from "./types";
import { createDemoSnapshot, stepSnapshot } from "../engine/simulation";
import { SHIFT_SECONDS } from "./fixtures";

/** Adapter boundary: a real source can emit the same immutable Snapshot shape. */
export function createDemoAdapter(): FactoryDataAdapter {
  let snapshot = createDemoSnapshot();
  let paused = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(s: Snapshot) => void>();
  const emit = () => listeners.forEach((listener) => listener(snapshot));
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      if (paused || snapshot.elapsed >= SHIFT_SECONDS) return;
      snapshot = stepSnapshot(snapshot, 10);
      emit();
    }, 1000);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
    setPaused(value) {
      paused = value;
    },
    setScenario(value: Scenario) {
      snapshot = createDemoSnapshot(value, snapshot.shift);
      emit();
    },
    setShift(value: Shift) {
      snapshot = createDemoSnapshot(snapshot.scenario, value);
      emit();
    },
    reset() {
      snapshot = createDemoSnapshot(snapshot.scenario, snapshot.shift);
      emit();
    },
    updateIncident(id: string, state: IncidentState) {
      snapshot = {
        ...snapshot,
        incidents: snapshot.incidents.map((i) =>
          i.id === id && !(state === "resolved" && i.conditionActive)
            ? { ...i, state }
            : i,
        ),
      };
      emit();
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
