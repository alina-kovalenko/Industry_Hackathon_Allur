import { memo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { Color, Group, Vector3 } from "three";
import type { Machine, Snapshot, AreaFilter } from "../data/types";
import { AREAS } from "../data/fixtures";
import { STATUS_COLORS } from "./ui";

type XYZ = [number, number, number];
export const stationPosition = (m: Machine): XYZ => [
  (m.position[0] - 1) * 5.35,
  0,
  (m.position[1] - 1.5) * 4.45,
];
const METAL = "#a7afb9";
const DARK = "#25272e";
const RED = "#aa171f";

function Block({
  at = [0, 0, 0],
  size,
  color = DARK,
  metal = 0.5,
  rough = 0.36,
  glow,
  opacity = 1,
}: {
  at?: XYZ;
  size: XYZ;
  color?: string;
  metal?: number;
  rough?: number;
  glow?: string;
  opacity?: number;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metal}
        roughness={rough}
        emissive={glow ?? "#000000"}
        emissiveIntensity={glow ? 1.4 : 0}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}
function Cylinder({
  at,
  radius,
  height,
  color = METAL,
  rotation = [0, 0, 0],
}: {
  at: XYZ;
  radius: number;
  height: number;
  color?: string;
  rotation?: XYZ;
}) {
  return (
    <mesh position={at} rotation={rotation} castShadow>
      <cylinderGeometry args={[radius, radius, height, 16]} />
      <meshStandardMaterial color={color} metalness={0.65} roughness={0.32} />
    </mesh>
  );
}

export const Vehicle = memo(function Vehicle({
  color = "#e0e2e5",
  compact = false,
}: {
  color?: string;
  compact?: boolean;
}) {
  return (
    <group scale={compact ? 0.64 : 1}>
      <RoundedBox
        args={[2.6, 0.43, 1.18]}
        radius={0.13}
        smoothness={2}
        position={[0, 0.52, 0]}
        castShadow
      >
        <meshStandardMaterial color={color} metalness={0.65} roughness={0.23} />
      </RoundedBox>
      <RoundedBox
        args={[1.4, 0.43, 1.02]}
        radius={0.16}
        smoothness={2}
        position={[-0.14, 0.9, 0]}
        castShadow
      >
        <meshStandardMaterial
          color="#131921"
          metalness={0.48}
          roughness={0.14}
        />
      </RoundedBox>
      <Block at={[-0.14, 1.115, 0]} size={[1.06, 0.055, 0.87]} color={color} />
      <Block at={[-0.12, 0.9, 0]} size={[0.07, 0.42, 1.04]} color={color} />
      <Block at={[0.95, 0.75, 0]} size={[0.57, 0.025, 0.94]} color={color} />
      <Block at={[1.28, 0.4, 0]} size={[0.08, 0.14, 0.63]} color="#16171c" />
      <Block at={[-1.27, 0.4, 0]} size={[0.08, 0.13, 0.7]} color="#16171c" />
      {[-0.85, 0.85].flatMap((x) =>
        [-0.6, 0.6].map((z) => (
          <group key={`${x}-${z}`}>
            <Cylinder
              at={[x, 0.32, z]}
              radius={0.255}
              height={0.16}
              color="#101013"
              rotation={[Math.PI / 2, 0, 0]}
            />
            <Cylinder
              at={[x, 0.32, z * 1.14]}
              radius={0.15}
              height={0.02}
              color="#c5c7cb"
              rotation={[Math.PI / 2, 0, 0]}
            />
          </group>
        )),
      )}
      {[-0.39, 0.39].map((z) => (
        <group key={z}>
          <Block
            at={[1.305, 0.6, z]}
            size={[0.025, 0.075, 0.21]}
            color="#ffffff"
            glow="#ffffff"
          />
          <Block
            at={[-1.305, 0.58, z]}
            size={[0.025, 0.08, 0.25]}
            color="#de1e2e"
            glow="#b71928"
          />
        </group>
      ))}
    </group>
  );
});

function Robot({
  position,
  flipped = false,
  active,
  reducedMotion,
}: {
  position: XYZ;
  flipped?: boolean;
  active: boolean;
  reducedMotion: boolean;
}) {
  const shoulder = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  const elapsed = useRef(flipped ? 1.4 : 0);
  useFrame((_, dt) => {
    if (!active || reducedMotion) return;
    elapsed.current += Math.min(dt, 0.06);
    if (shoulder.current)
      shoulder.current.rotation.y = Math.sin(elapsed.current * 0.7) * 0.28;
    if (elbow.current)
      elbow.current.rotation.z = -0.85 + Math.sin(elapsed.current * 1.1) * 0.22;
  });
  return (
    <group position={position} rotation={[0, flipped ? Math.PI : 0, 0]}>
      <Cylinder at={[0, 0.16, 0]} radius={0.3} height={0.3} color="#363941" />
      <Cylinder at={[0, 0.33, 0]} radius={0.2} height={0.1} color="#d0d3d8" />
      <group ref={shoulder} position={[0, 0.4, 0]}>
        <Cylinder at={[0, 0.13, 0]} radius={0.17} height={0.27} color={RED} />
        <group rotation={[0, 0, -0.32]}>
          <Block
            at={[0, 0.48, 0]}
            size={[0.24, 0.78, 0.25]}
            color="#ae2228"
            metal={0.45}
          />
          <Block
            at={[0.14, 0.48, 0]}
            size={[0.035, 0.59, 0.16]}
            color="#d4d7db"
          />
          <Cylinder
            at={[0, 0.89, 0]}
            radius={0.19}
            height={0.33}
            color="#4c515a"
            rotation={[Math.PI / 2, 0, 0]}
          />
          <group ref={elbow} position={[0, 0.9, 0]} rotation={[0, 0, -0.85]}>
            <Block at={[0, 0.43, 0]} size={[0.19, 0.77, 0.2]} color="#c23438" />
            <Block
              at={[0, 0.85, 0]}
              size={[0.24, 0.12, 0.24]}
              color="#d2d5d9"
            />
            <Block
              at={[-0.12, 0.98, 0]}
              size={[0.05, 0.22, 0.16]}
              color="#737984"
            />
            <Block
              at={[0.12, 0.98, 0]}
              size={[0.05, 0.22, 0.16]}
              color="#737984"
            />
          </group>
        </group>
      </group>
    </group>
  );
}

function MachineModel({
  machine,
  color,
  active,
  reducedMotion,
  dimmed = false,
}: {
  machine: Machine;
  color: string;
  active: boolean;
  reducedMotion: boolean;
  dimmed?: boolean;
}) {
  const surface = dimmed ? "#33353c" : "#bfc3ca";
  const trim = dimmed ? "#282930" : "#727983";
  return (
    <group>
      <Block
        size={[3.75, 0.16, 2.65]}
        at={[0, 0.02, 0]}
        color="#1b1c21"
        rough={0.48}
      />
      <Block
        size={[3.62, 0.055, 0.065]}
        at={[0, 0.12, 1.28]}
        color={color}
        glow={color}
      />
      <Block
        size={[3.62, 0.055, 0.065]}
        at={[0, 0.12, -1.28]}
        color={color}
        glow={color}
      />
      {machine.kind === "robot" && (
        <>
          <Block at={[0, 0.2, 0]} size={[3.15, 0.15, 1.3]} color="#494d57" />
          <Vehicle color={surface} />
          <Robot
            position={[-1.1, 0.1, -1.03]}
            active={active}
            reducedMotion={reducedMotion}
          />
          <Robot
            position={[1.1, 0.1, 1.03]}
            flipped
            active={active}
            reducedMotion={reducedMotion}
          />
          <Block
            at={[-1.65, 0.52, 0.94]}
            size={[0.26, 0.78, 0.28]}
            color={surface}
          />
          <Block
            at={[-1.65, 0.7, 1.087]}
            size={[0.18, 0.19, 0.02]}
            color="#171b20"
            glow={active ? "#1b4450" : undefined}
          />
        </>
      )}
      {machine.kind === "booth" && (
        <>
          <Block
            at={[0, 0.85, -1.04]}
            size={[3.25, 1.47, 0.16]}
            color={surface}
          />
          <Block at={[-1.58, 0.88, 0]} size={[0.16, 1.5, 2.06]} color={trim} />
          <Block
            at={[1.58, 0.88, 0]}
            size={[0.16, 1.5, 2.06]}
            color={surface}
          />
          <Block at={[0, 1.72, 0]} size={[3.42, 0.24, 2.25]} color={surface} />
          <Block at={[0, 1.92, -0.18]} size={[2.8, 0.16, 1.26]} color={trim} />
          <Block
            at={[0, 1.52, 1.07]}
            size={[3.28, 0.13, 0.07]}
            color="#be2830"
          />
          <Block
            at={[0, 0.48, 1.065]}
            size={[3.24, 0.63, 0.1]}
            color={surface}
          />
          {[-1.08, 0, 1.08].map((x) => (
            <group key={x}>
              <Block
                at={[x, 1.03, 1.07]}
                size={[0.96, 0.49, 0.07]}
                color="#142029"
                metal={0.18}
                rough={0.13}
              />
              <Block
                at={[x, 1.27, 1.13]}
                size={[0.88, 0.018, 0.018]}
                color={color}
                glow={color}
              />
              <Block
                at={[x + 0.46, 1.02, 1.12]}
                size={[0.035, 0.55, 0.04]}
                color="#eeeef1"
              />
              <Block
                at={[x + 0.37, 0.7, 1.14]}
                size={[0.02, 0.12, 0.018]}
                color="#24252b"
              />
            </group>
          ))}
          {[-0.95, 0.95].map((x) => (
            <group key={x}>
              <Cylinder
                at={[x, 2.15, -0.38]}
                radius={0.21}
                height={0.38}
                color="#626873"
              />
              <Cylinder
                at={[x, 2.36, -0.38]}
                radius={0.26}
                height={0.06}
                color="#959ba5"
              />
            </group>
          ))}
          <Vehicle color={dimmed ? "#34353a" : "#c82c30"} compact />
        </>
      )}
      {machine.kind === "assembly" && (
        <>
          <Block at={[0, 0.21, 0]} size={[3.25, 0.19, 1.65]} color="#474c56" />
          <Vehicle color={surface} />
          {[-1.48, 1.48].map((x) => (
            <group key={x}>
              <Block
                at={[x, 1.03, -0.88]}
                size={[0.15, 1.88, 0.16]}
                color={surface}
              />
              <Block
                at={[x, 1.98, 0]}
                size={[0.18, 0.15, 1.98]}
                color={surface}
              />
              <Block
                at={[x, 1.03, 0.89]}
                size={[0.15, 1.88, 0.16]}
                color={surface}
              />
              <Block
                at={[x, 1.83, -0.02]}
                size={[0.08, 0.03, 1.7]}
                color="#fcf3df"
                glow="#fcf3df"
              />
            </group>
          ))}
          <Block
            at={[0, 2.05, -0.86]}
            size={[3.22, 0.15, 0.19]}
            color="#a8262d"
          />
          <Block
            at={[0, 0.53, -1.13]}
            size={[1.5, 0.65, 0.3]}
            color={surface}
          />
          <Block
            at={[0, 0.62, -0.962]}
            size={[0.7, 0.24, 0.035]}
            color="#141922"
          />
        </>
      )}
      {machine.kind === "scanner" && (
        <>
          <Block at={[0, 0.16, 0]} size={[3.25, 0.14, 1.62]} color="#41444d" />
          <Vehicle color={surface} />
          {[-0.97, 0.97].map((z) => (
            <group key={z}>
              <Block
                at={[0.55, 1.06, z]}
                size={[0.16, 1.87, 0.18]}
                color={surface}
              />
              <Block
                at={[0.55, 1.22, z * 0.92]}
                size={[0.085, 1.44, 0.015]}
                color={color}
                glow={color}
              />
            </group>
          ))}
          <Block at={[0.55, 2.01, 0]} size={[0.28, 0.2, 2.2]} color={surface} />
          <Block
            at={[0.55, 1.88, 0]}
            size={[0.07, 0.023, 1.72]}
            color={color}
            glow={color}
          />
          <Block
            at={[1.48, 0.76, 0.97]}
            size={[0.3, 1.22, 0.33]}
            color={trim}
          />
          <Block
            at={[1.48, 1.02, 1.148]}
            size={[0.23, 0.24, 0.02]}
            color="#18212a"
            glow={active ? "#304957" : undefined}
          />
          <mesh position={[0.55, 1.0, 0]}>
            <boxGeometry args={[0.008, 1.64, 1.75]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={active ? 0.09 : 0.025}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <Cylinder
        at={[1.69, 1.95, -1.13]}
        radius={0.035}
        height={0.35}
        color="#81858c"
      />
      <mesh position={[1.69, 2.16, -1.13]}>
        <cylinderGeometry args={[0.078, 0.078, 0.15, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}

function Transfer({
  from,
  to,
  active,
  paused,
  index,
}: {
  from: XYZ;
  to: XYZ;
  active: boolean;
  paused: boolean;
  index: number;
}) {
  const token = useRef<Group>(null);
  const phase = useRef((index * 0.29) % 1);
  const start = new Vector3(...from),
    end = new Vector3(...to);
  const length = start.distanceTo(end);
  const center = start.clone().lerp(end, 0.5);
  const rotation = Math.atan2(to[0] - from[0], to[2] - from[2]);
  useFrame((_, dt) => {
    if (!active || paused) return;
    phase.current = (phase.current + Math.min(dt, 0.06) * 0.14) % 1;
    if (token.current)
      token.current.position.lerpVectors(start, end, phase.current).setY(0.24);
  });
  return (
    <group>
      <group position={[center.x, 0.03, center.z]} rotation={[0, rotation, 0]}>
        <Block size={[0.73, 0.1, length]} color="#1e2128" />
        {[-0.36, 0.36].map((x) => (
          <Block
            key={x}
            at={[x, 0.1, 0]}
            size={[0.035, 0.05, length]}
            color="#737884"
          />
        ))}
        {Array.from({ length: Math.floor(length * 3) }, (_, i) => (
          <Cylinder
            key={i}
            at={[0, 0.095, -length / 2 + 0.2 + i / 3]}
            radius={0.04}
            height={0.65}
            color="#41454f"
            rotation={[0, 0, Math.PI / 2]}
          />
        ))}
      </group>
      {active && (
        <group ref={token} position={[center.x, 0.24, center.z]}>
          <Block size={[0.33, 0.06, 0.26]} color="#f1f1ee" glow="#9cb3c2" />
        </group>
      )}
    </group>
  );
}

export const FactoryScene = memo(function FactoryScene({
  snapshot,
  selected,
  area,
  layer,
  paused,
  reducedMotion,
  onSelect,
  onHover,
  labels,
}: {
  snapshot: Snapshot;
  selected: string | null;
  area: AreaFilter;
  layer: "status" | "utilization";
  paused: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  labels: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const projected = useRef(new Vector3());
  // Project into a single DOM overlay; keep labels in the app's React root.
  useFrame(({ camera, size }) => {
    for (const machine of snapshot.machines) {
      const label = labels.current.get(machine.id);
      if (!label) continue;
      const position = stationPosition(machine);
      const point = projected.current
        .set(position[0], machine.kind === "booth" ? 2.8 : 2.48, position[2])
        .project(camera);
      const visible =
        point.z > -1 &&
        point.z < 1 &&
        Math.abs(point.x) < 1.12 &&
        Math.abs(point.y) < 1.12;
      label.style.visibility = visible ? "visible" : "hidden";
      label.style.transform = `translate(-50%, -50%) translate(${((point.x + 1) * size.width) / 2}px, ${((1 - point.y) * size.height) / 2}px)`;
      label.style.zIndex = String(Math.round((1 - point.z) * 1000));
    }
  });
  return (
    <group>
      <Block
        at={[0, -0.3, 0]}
        size={[20.2, 0.48, 20.2]}
        color="#08080b"
        metal={0.1}
        rough={0.8}
      />
      <gridHelper
        args={[20, 28, "#33303b", "#26232c"]}
        position={[0, -0.045, 0]}
      />
      {[-10, 10].map((x) => (
        <Block
          key={x}
          at={[x, -0.035, 0]}
          size={[0.025, 0.04, 20.15]}
          color="#c12831"
          glow="#5e161c"
        />
      ))}
      {[-10, 10].map((z) => (
        <Block
          key={z}
          at={[0, -0.035, z]}
          size={[20, 0.04, 0.025]}
          color="#c12831"
          glow="#5e161c"
        />
      ))}
      {AREAS.map((a, row) => (
        <group key={a}>
          <Block
            at={[0, -0.03, (row - 1.5) * 4.45 + 1.68]}
            size={[15.9, 0.015, 0.024]}
            color="#45454c"
          />
        </group>
      ))}
      {snapshot.machines.slice(0, -1).map((machine, i) => (
        <Transfer
          key={machine.id}
          from={stationPosition(machine)}
          to={stationPosition(snapshot.machines[i + 1])}
          active={machine.status === "running" || machine.status === "warning"}
          paused={paused || reducedMotion}
          index={i}
        />
      ))}
      {snapshot.machines.map((machine) => {
        const inArea = area === "All areas" || machine.area === area;
        const utilization = snapshot.elapsed
          ? machine.runTime / snapshot.elapsed
          : 0;
        const color = !inArea
          ? "#45464f"
          : layer === "status"
            ? STATUS_COLORS[machine.status]
            : new Color("#647080")
                .lerp(new Color("#f6f6f6"), utilization)
                .getStyle();
        return (
          <group
            key={machine.id}
            position={stationPosition(machine)}
            onClick={(e) => {
              e.stopPropagation();
              if (e.delta <= 5) onSelect(machine.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(machine.id);
            }}
            onPointerOut={() => onHover(null)}
          >
            <MachineModel
              machine={machine}
              color={color}
              active={
                inArea &&
                !paused &&
                (machine.status === "running" || machine.status === "warning")
              }
              reducedMotion={reducedMotion}
              dimmed={!inArea}
            />
            {machine.id === selected && (
              <>
                <Block
                  at={[0, 0.005, 1.52]}
                  size={[4.08, 0.028, 0.036]}
                  color="#ff3545"
                  glow="#ff3545"
                />
                <Block
                  at={[0, 0.005, -1.52]}
                  size={[4.08, 0.028, 0.036]}
                  color="#ff3545"
                  glow="#ff3545"
                />
                {[-2.04, 2.04].map((x) => (
                  <Block
                    key={x}
                    at={[x, 0.005, 0]}
                    size={[0.036, 0.028, 3.08]}
                    color="#ff3545"
                    glow="#ff3545"
                  />
                ))}
              </>
            )}
          </group>
        );
      })}
    </group>
  );
});

export { MachineModel };
