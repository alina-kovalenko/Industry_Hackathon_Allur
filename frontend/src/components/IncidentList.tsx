import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";
import type { AreaFilter, IncidentState, Snapshot } from "../data/types";
import { clockLabel } from "../engine/metrics";
import { PanelTitle } from "./ui";

export function IncidentList({
  snapshot,
  area,
  onSelect,
  onUpdate,
}: {
  snapshot: Snapshot;
  area: AreaFilter;
  onSelect: (id: string) => void;
  onUpdate: (id: string, state: IncidentState) => void;
}) {
  const incidents = snapshot.incidents.filter(
    (i) =>
      area === "All areas" ||
      snapshot.machines.find((m) => m.id === i.equipmentId)?.area === area,
  );
  const active = incidents.filter((i) => i.conditionActive);
  return (
    <section className="panel incident-panel" id="incidents">
      <PanelTitle eyebrow="OPERATIONAL SIGNALS" title="Incidents & exceptions">
        <span className={`count-badge ${active.length ? "amber" : ""}`}>
          {active.length} active
        </span>
      </PanelTitle>
      <div className="incident-content">
        {incidents.length ? (
          incidents.map((incident) => (
            <div
              key={incident.id}
              className={`incident-item ${incident.severity} ${!incident.conditionActive ? "resolved" : ""}`}
            >
              <button
                className="incident-main"
                onClick={() => onSelect(incident.equipmentId)}
              >
                <div className="incident-symbol">
                  {incident.conditionActive ? (
                    <TriangleAlert size={17} />
                  ) : (
                    <CircleCheck size={17} />
                  )}
                </div>
                <div>
                  <div className="incident-title">
                    {incident.title}
                    <ArrowUpRight size={13} />
                  </div>
                  <p>
                    {incident.equipmentId} <span>·</span> Since{" "}
                    {clockLabel(incident.startedAt, snapshot.shift)}{" "}
                    <span>·</span> {incident.id}
                  </p>
                  <span className="incident-workflow">
                    {incident.state === "new" ? "Needs review" : incident.state}
                  </span>
                </div>
              </button>
              {incident.conditionActive && (
                <button
                  className={`acknowledge ${incident.state !== "new" ? "done" : ""}`}
                  onClick={() =>
                    onUpdate(
                      incident.id,
                      incident.state === "new"
                        ? "acknowledged"
                        : "investigating",
                    )
                  }
                  disabled={incident.state === "investigating"}
                >
                  {incident.state === "new" ? (
                    <>
                      <Check size={12} />
                      Acknowledge
                    </>
                  ) : incident.state === "acknowledged" ? (
                    "Investigate"
                  ) : (
                    "Investigating"
                  )}
                </button>
              )}
              <p className="incident-description">{incident.symptoms}</p>
            </div>
          ))
        ) : (
          <div className="all-clear">
            <CircleCheck size={25} />
            <div>
              <strong>All clear in this view</strong>
              <p>No incidents match the selected production area.</p>
            </div>
          </div>
        )}
      </div>
      <div className="incident-note">
        <span className="dot" />
        {snapshot.scenario === "normal"
          ? "All stations operating at nominal cycle time"
          : "Alerts are linked to the simulated equipment condition"}
        <ChevronRight size={13} />
      </div>
    </section>
  );
}
