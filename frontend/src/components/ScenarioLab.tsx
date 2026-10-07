import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Beaker,
  Clock3,
  Info,
  Play,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { Snapshot } from "../data/types";
import { compareResponse, conditionActive } from "../engine/simulation";
import { clockLabel, duration } from "../engine/metrics";
import { ForecastChart } from "./Charts";
import { PanelTitle } from "./ui";

export function ScenarioLab({ snapshot }: { snapshot: Snapshot }) {
  const [repair, setRepair] = useState(5);
  const [capacity, setCapacity] = useState(100);
  const [comparison, setComparison] = useState(() => ({
    result: compareResponse(snapshot, 5, 100),
    initial: structuredClone(snapshot),
    repair: 5,
    capacity: 100,
  }));
  const [busy, setBusy] = useState(false);
  const { result, initial } = comparison;
  const baseOutput =
    result.baseline.machines.at(-1)!.good - initial.machines.at(-1)!.good;
  const responseOutput =
    result.response.machines.at(-1)!.good - initial.machines.at(-1)!.good;
  const queue = (s: Snapshot) =>
    s.machines.reduce((n, m) => n + m.queue.length, 0);
  const downtime = (s: Snapshot) =>
    s.machines.reduce((n, m) => n + m.downtime, 0);
  const difference = responseOutput - baseOutput;
  const changed =
    repair !== comparison.repair ||
    capacity !== comparison.capacity ||
    snapshot.scenario !== initial.scenario ||
    snapshot.shift !== initial.shift;
  const run = (r = repair, c = capacity) => {
    setBusy(true);
    setTimeout(() => {
      setComparison({
        result: compareResponse(snapshot, r, c),
        initial: structuredClone(snapshot),
        repair: r,
        capacity: c,
      });
      setBusy(false);
    }, 30);
  };
  return (
    <div className="scenario-view">
      <div className="scenario-banner">
        <div className="banner-icon">
          <Beaker size={27} />
        </div>
        <div>
          <span className="eyebrow">EXPLORE BEFORE YOU ACT</span>
          <h2>A better outcome starts with a what-if.</h2>
          <p>
            Compare a response against current conditions using the same
            production model.
          </p>
        </div>
        <span className="simulation-label">SIMULATION ONLY</span>
      </div>
      <div className="scenario-grid">
        <section className="panel scenario-controls">
          <PanelTitle
            eyebrow="RESPONSE SETTINGS"
            title="Adjust the intervention"
          >
            <Wrench size={17} />
          </PanelTitle>
          <div className="scenario-equipment">
            <span className="equipment-icon">
              <Wrench size={19} />
            </span>
            <div>
              <strong>PNT-02</strong>
              <span>Precision paint booth</span>
            </div>
            <ArrowUpRight size={14} />
          </div>
          <div className="slider-control">
            <label htmlFor="repair">
              Time until restoration
              <strong>
                {repair}
                <span> min</span>
              </strong>
            </label>
            <input
              id="repair"
              aria-label="Time until restoration"
              type="range"
              min="0"
              max="30"
              step="1"
              value={repair}
              onChange={(e) => setRepair(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>Immediate</span>
              <span>30 minutes</span>
            </div>
            <p>
              Restore nominal cycle time or resume a stopped booth after this
              delay.
            </p>
          </div>
          <div className="slider-control">
            <label htmlFor="capacity">
              Effective capacity
              <strong>
                {capacity}
                <span>%</span>
              </strong>
            </label>
            <input
              id="capacity"
              aria-label="Effective capacity"
              type="range"
              min="80"
              max="120"
              step="5"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>80%</span>
              <span>120%</span>
            </div>
            <p>
              Apply a cycle-time adjustment to PNT-02 throughout the projection.
            </p>
          </div>
          {!conditionActive(snapshot) && (
            <div className="inline-info">
              <Info size={14} />
              No active fault. Restoration timing has no effect; capacity can
              still be compared.
            </div>
          )}
          <button
            className="primary-button"
            onClick={() => run()}
            disabled={busy}
          >
            <Play size={14} fill="currentColor" />
            {busy ? "Simulating…" : "Run comparison"}
            <ArrowRight size={15} />
          </button>
          <button
            className="text-button reset-scenario"
            onClick={() => {
              setRepair(5);
              setCapacity(100);
              run(5, 100);
            }}
          >
            <RotateCcw size={12} />
            Reset settings
          </button>
          <div className="scenario-assumptions">
            <Info size={14} />
            <div>
              <strong>Model assumptions</strong>
              <p>
                One serial route · finite buffers · fixed cycle times ·
                deterministic final inspection. No alternative routes, staffing,
                or rework.
              </p>
            </div>
          </div>
        </section>
        <div className="scenario-results">
          <section className="panel forecast-panel">
            <PanelTitle
              eyebrow="PROJECTED PRODUCTION"
              title={`The next ${result.horizonMinutes} minutes`}
            >
              <span className="snapshot-time">
                <Clock3 size={12} />
                From {clockLabel(initial.elapsed, initial.shift)}
              </span>
            </PanelTitle>
            <div className="forecast-summary">
              <div>
                <span>Current conditions</span>
                <strong>
                  {baseOutput}
                  <small> good units</small>
                </strong>
              </div>
              <ArrowRight size={21} />
              <div>
                <span>With your response</span>
                <strong className="cyan-text">
                  {responseOutput}
                  <small> good units</small>
                </strong>
              </div>
              <div
                className={`forecast-gain ${difference < 0 ? "negative" : ""}`}
              >
                <Sparkles size={15} />
                <strong>
                  {difference >= 0 ? "+" : ""}
                  {difference}
                </strong>
                <span>good units</span>
              </div>
            </div>
            {changed && (
              <div className="comparison-dirty">
                Settings or source scenario changed. Run comparison to update
                these results.
              </div>
            )}
            <ForecastChart result={result} />
          </section>
          <section className="panel comparison-table">
            <PanelTitle
              eyebrow="EXPECTED IMPACT"
              title="Compare the outcomes"
            />
            <table>
              <thead>
                <tr>
                  <th>Over projection horizon</th>
                  <th>Current</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Additional good units</td>
                  <td>{baseOutput}</td>
                  <td>{responseOutput}</td>
                </tr>
                <tr>
                  <td>Units in input buffers at end</td>
                  <td>{queue(result.baseline)}</td>
                  <td>{queue(result.response)}</td>
                </tr>
                <tr>
                  <td>Additional equipment downtime</td>
                  <td>
                    {duration(downtime(result.baseline) - downtime(initial))}
                  </td>
                  <td>
                    {duration(downtime(result.response) - downtime(initial))}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="method-note">
              Projection from a saved simulation snapshot. Changes here do not
              alter the live overview. Results describe this simplified model,
              not measured factory savings.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
