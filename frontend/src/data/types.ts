export type Area = "Body Shop" | "Paint Shop" | "Assembly" | "Quality Control";
export type AreaFilter = Area | "All areas";
export type MachineStatus =
  | "running"
  | "warning"
  | "stopped"
  | "idle"
  | "blocked"
  | "offline";
export type Scenario = "normal" | "slowdown" | "recovery";
export type Shift = "day" | "evening";
export type IncidentState =
  | "new"
  | "acknowledged"
  | "investigating"
  | "resolved";

export interface EquipmentDefinition {
  id: string;
  name: string;
  area: Area;
  nominalCycle: number;
  bufferCapacity: number;
  kind: "robot" | "booth" | "assembly" | "scanner";
  position: [number, number];
}
export interface StatusSegment {
  status: MachineStatus;
  start: number;
  end: number;
}
export interface Machine extends EquipmentDefinition {
  status: MachineStatus;
  queue: number[];
  activeUnit: number | null;
  progress: number;
  cycleTime: number;
  total: number;
  good: number;
  rejected: number;
  downtime: number;
  idleTime: number;
  blockedTime: number;
  runTime: number;
  history: StatusSegment[];
  lastUpdated: number;
}
export interface Incident {
  id: string;
  equipmentId: string;
  severity: "warning" | "critical";
  startedAt: number;
  title: string;
  symptoms: string;
  state: IncidentState;
  conditionActive: boolean;
}
export interface TrendPoint {
  time: number;
  good: number;
  target: number;
  areas: Record<Area, { good: number; total: number; queue: number }>;
}
export interface Snapshot {
  elapsed: number;
  shift: Shift;
  scenario: Scenario;
  machines: Machine[];
  incidents: Incident[];
  trend: TrendPoint[];
  admitted: number;
  nextUnit: number;
  lastArrival: number;
  faultStart: number;
  faultEnd: number | null;
  capacityMultiplier: number;
  shiftTarget: number;
  updatedAt: number;
}
export interface PredictionResponse {
  equipmentId: string;
  source: "demo-rule" | "model";
  condition: string;
  horizonMinutes: number;
  level: "low" | "elevated" | "high";
  factors: string[];
  generatedAt: number;
}
export interface ForecastResult {
  baseline: Snapshot;
  response: Snapshot;
  series: { minutes: number; baseline: number; response: number }[];
  horizonMinutes: number;
}
export interface FactoryDataAdapter {
  getSnapshot(): Snapshot;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
  setPaused(paused: boolean): void;
  setScenario(scenario: Scenario): void;
  setShift(shift: Shift): void;
  reset(): void;
  updateIncident(id: string, state: IncidentState): void;
  dispose(): void;
}
