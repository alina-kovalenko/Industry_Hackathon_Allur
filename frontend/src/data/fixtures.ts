import type { Area, EquipmentDefinition, Scenario } from "./types";

export const AREAS: Area[] = [
  "Body Shop",
  "Paint Shop",
  "Assembly",
  "Quality Control",
];
export const AREA_COLORS: Record<Area, string> = {
  "Body Shop": "#72c4fc",
  "Paint Shop": "#b69bfa",
  Assembly: "#5fe1d0",
  "Quality Control": "#e0c588",
};
export const SHIFT_SECONDS = 8 * 3600;
export const DEMO_ELAPSED = 3 * 3600 + 24 * 60;
export const EQUIPMENT: EquipmentDefinition[] = [
  {
    id: "BDY-01",
    name: "Body framing",
    area: "Body Shop",
    nominalCycle: 76,
    bufferCapacity: 8,
    kind: "robot",
    position: [0, 0],
  },
  {
    id: "BDY-02",
    name: "Robotic welding",
    area: "Body Shop",
    nominalCycle: 82,
    bufferCapacity: 6,
    kind: "robot",
    position: [1, 0],
  },
  {
    id: "BDY-03",
    name: "Body finishing",
    area: "Body Shop",
    nominalCycle: 78,
    bufferCapacity: 6,
    kind: "robot",
    position: [2, 0],
  },
  {
    id: "PNT-01",
    name: "Surface preparation",
    area: "Paint Shop",
    nominalCycle: 80,
    bufferCapacity: 8,
    kind: "booth",
    position: [2, 1],
  },
  {
    id: "PNT-02",
    name: "Precision paint booth",
    area: "Paint Shop",
    nominalCycle: 84,
    bufferCapacity: 8,
    kind: "booth",
    position: [1, 1],
  },
  {
    id: "PNT-03",
    name: "Curing tunnel",
    area: "Paint Shop",
    nominalCycle: 82,
    bufferCapacity: 6,
    kind: "booth",
    position: [0, 1],
  },
  {
    id: "ASM-01",
    name: "Powertrain marriage",
    area: "Assembly",
    nominalCycle: 82,
    bufferCapacity: 8,
    kind: "assembly",
    position: [0, 2],
  },
  {
    id: "ASM-02",
    name: "Interior installation",
    area: "Assembly",
    nominalCycle: 80,
    bufferCapacity: 6,
    kind: "assembly",
    position: [1, 2],
  },
  {
    id: "ASM-03",
    name: "Final assembly",
    area: "Assembly",
    nominalCycle: 78,
    bufferCapacity: 6,
    kind: "assembly",
    position: [2, 2],
  },
  {
    id: "QC-01",
    name: "Vision inspection",
    area: "Quality Control",
    nominalCycle: 68,
    bufferCapacity: 8,
    kind: "scanner",
    position: [2, 3],
  },
  {
    id: "QC-02",
    name: "Dynamic testing",
    area: "Quality Control",
    nominalCycle: 74,
    bufferCapacity: 6,
    kind: "scanner",
    position: [1, 3],
  },
  {
    id: "QC-03",
    name: "Final release",
    area: "Quality Control",
    nominalCycle: 65,
    bufferCapacity: 6,
    kind: "scanner",
    position: [0, 3],
  },
];
export const SCENARIOS: Record<
  Scenario,
  { label: string; short: string; description: string }
> = {
  normal: {
    label: "Normal production",
    short: "Normal",
    description: "Balanced flow. All stations operate at nominal cycle time.",
  },
  slowdown: {
    label: "Paint station slowdown",
    short: "Slowdown",
    description:
      "PNT-02 cycle time increases from 84 to 151 seconds. Upstream queues grow and downstream stations wait.",
  },
  recovery: {
    label: "Stop & recovery",
    short: "Recovery",
    description:
      "PNT-02 stops at 11:22 (day shift) for six simulated minutes, then restarts automatically.",
  },
};
