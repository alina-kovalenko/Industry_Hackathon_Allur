import {
  Component,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Rotate3D,
  ScanLine,
} from "lucide-react";
import { AREAS } from "../data/fixtures";
import type { Snapshot, AreaFilter, Machine } from "../data/types";
import { bottleneck } from "../engine/metrics";
import { STATUS_COLORS, STATUS_LABELS, PanelTitle } from "./ui";
import { FactoryScene, MachineModel } from "./FactoryScene";

const HOME = new Vector3(19, 21, 23);
const TARGET = new Vector3(0, -2.3, 0);
const DISTANCE = HOME.distanceTo(TARGET);

export class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <ScanLine size={28} />
        <strong>3D view is unavailable</strong>
        <span>
          Enable hardware acceleration to explore the factory. Equipment data is
          available below.
        </span>
      </div>
    ) : (
      this.props.children
    );
  }
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#e6ecff", "#3a3033", 1.6]} />
      <directionalLight
        position={[8, 18, 12]}
        intensity={3.2}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.001}
      />
      <directionalLight
        position={[-10, 6, -8]}
        intensity={1.7}
        color="#becaff"
      />
      <Environment resolution={64} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.5}
          position={[0, 10, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[20, 20, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2}
          position={[0, 5, 12]}
          scale={[15, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#e3d8d6"
          position={[-10, 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[12, 6, 1]}
        />
      </Environment>
    </>
  );
}
function FitCamera({ onFit }: { onFit: (distance: number) => void }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useEffect(() => {
    const scale = Math.max(1, 1.05 / (size.width / size.height));
    camera.position.copy(
      HOME.clone().sub(TARGET).multiplyScalar(scale).add(TARGET),
    );
    camera.lookAt(TARGET);
    onFit(DISTANCE * scale);
  }, [camera, size.width, size.height, onFit]);
  return null;
}
export function EquipmentModel({
  machine,
  paused,
}: {
  machine: Machine;
  paused: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className="equipment-model"
      aria-label={`360 degree model of ${machine.id}`}
    >
      <SceneBoundary>
        <Canvas
          camera={{ position: [5, 3.8, 5], fov: 39 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true }}
          fallback={<div className="scene-fallback">3D requires WebGL</div>}
        >
          <StudioLights />
          <group position={[0, -0.7, 0]}>
            <MachineModel
              machine={machine}
              color={STATUS_COLORS[machine.status]}
              active={
                !paused && ["running", "warning"].includes(machine.status)
              }
              reducedMotion={reducedMotion}
            />
          </group>
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={4}
            maxDistance={13}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2}
            target={[0, 0.1, 0]}
            enableDamping
          />
        </Canvas>
      </SceneBoundary>
      <span className="equipment-model-hint">
        <Rotate3D size={12} /> Drag to rotate · scroll to zoom
      </span>
    </div>
  );
}

export const FactoryMap = memo(function FactoryMap({
  snapshot,
  selected,
  onSelect,
  area,
  paused,
  expanded,
  onExpand,
}: {
  snapshot: Snapshot;
  selected: string | null;
  onSelect: (id: string) => void;
  area: AreaFilter;
  paused: boolean;
  expanded: boolean;
  onExpand: () => void;
}) {
  const [layer, setLayer] = useState<"status" | "utilization">("status");
  const [hover, setHover] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [angle, setAngle] = useState(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const baseDistance = useRef(DISTANCE);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const fitCamera = useCallback((distance: number) => {
    baseDistance.current = distance;
    setZoom(100);
  }, []);
  const reducedMotion = useReducedMotion();
  const constraint = bottleneck(snapshot);
  const hoverMachine = snapshot.machines.find((m) => m.id === hover);
  const moveCamera = (
    action: "left" | "right" | "in" | "out" | "reset" | "top",
  ) => {
    const orbit = controls.current;
    if (!orbit) return;
    setAutoRotate(false);
    const offset = orbit.object.position.clone().sub(orbit.target);
    if (action === "reset") {
      orbit.target.copy(TARGET);
      orbit.object.position.copy(
        HOME.clone()
          .sub(TARGET)
          .multiplyScalar(baseDistance.current / DISTANCE)
          .add(TARGET),
      );
    } else if (action === "top") {
      orbit.target.copy(TARGET);
      orbit.object.position.set(0, 38, 0.01);
    } else {
      if (action === "left" || action === "right")
        offset.applyAxisAngle(
          new Vector3(0, 1, 0),
          action === "left" ? -Math.PI / 4 : Math.PI / 4,
        );
      else
        offset.multiplyScalar(action === "in" ? 0.8 : 1.25).clampLength(12, 65);
      orbit.object.position.copy(orbit.target).add(offset);
    }
    orbit.update();
  };
  return (
    <section
      className={`panel factory-panel ${expanded ? "expanded" : ""}`}
      aria-label="Interactive factory map"
    >
      <PanelTitle eyebrow="SPATIAL INTELLIGENCE" title="The production floor">
        <div className="panel-actions">
          <span className="twin-tag">LIVE TWIN / 01</span>
          <button
            className={`icon-button ${expanded ? "active" : ""}`}
            onClick={onExpand}
            title={expanded ? "Exit expanded view" : "Expand factory map"}
            aria-label={expanded ? "Exit expanded view" : "Expand factory map"}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </PanelTitle>
      <div className="map-toolbar">
        <div className="segmented small" aria-label="Map layer">
          <button
            className={layer === "status" ? "active" : ""}
            aria-pressed={layer === "status"}
            onClick={() => setLayer("status")}
          >
            <Layers3 size={13} />
            Status
          </button>
          <button
            className={layer === "utilization" ? "active" : ""}
            aria-pressed={layer === "utilization"}
            onClick={() => setLayer("utilization")}
          >
            Utilization
          </button>
        </div>
        <span className="map-live">
          <span className={paused ? "dot muted-dot" : "dot"} />
          {paused ? "Simulation paused" : "Simulation live"}
        </span>
      </div>
      <div
        className="factory-canvas"
        tabIndex={0}
        aria-label="Factory 3D viewport. Drag to orbit, scroll to zoom. Arrow keys rotate, plus and minus zoom, Home resets."
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const action = (
            {
              ArrowLeft: "left",
              ArrowRight: "right",
              "+": "in",
              "=": "in",
              "-": "out",
              Home: "reset",
            } as const
          )[e.key as "ArrowLeft"];
          if (action) {
            e.preventDefault();
            moveCamera(action);
          }
        }}
      >
        <div className="scene-coordinate">
          KOSTANAY / KZ<span>12 STATIONS · 4 PRODUCTION AREAS</span>
        </div>
        <div className="scene-3d-badge">
          <Rotate3D size={14} />
          <span>
            360°<small>INTERACTIVE</small>
          </span>
        </div>
        <SceneBoundary>
          <Canvas
            style={{ position: "absolute", inset: 0 }}
            shadows
            camera={{ position: HOME.toArray(), fov: 42, near: 0.1, far: 150 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true }}
            fallback={
              <div className="scene-fallback">
                3D requires WebGL. Use the equipment selector below.
              </div>
            }
          >
            <StudioLights />
            <FitCamera onFit={fitCamera} />
            <FactoryScene
              snapshot={snapshot}
              labels={labels}
              selected={selected}
              area={area}
              layer={layer}
              paused={paused}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
              onHover={setHover}
            />
            <OrbitControls
              ref={controls}
              makeDefault
              target={TARGET}
              minDistance={12}
              maxDistance={65}
              minPolarAngle={0.08}
              maxPolarAngle={Math.PI / 2 - 0.06}
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.65}
              zoomSpeed={0.75}
              autoRotate={autoRotate && !reducedMotion}
              autoRotateSpeed={0.45}
              onStart={() => setAutoRotate(false)}
              onChange={() => {
                if (!controls.current) return;
                setZoom(
                  Math.round(
                    (baseDistance.current / controls.current.getDistance()) *
                      100,
                  ),
                );
                setAngle(
                  (Math.round(
                    (controls.current.getAzimuthalAngle() * 180) / Math.PI,
                  ) +
                    360) %
                    360,
                );
              }}
            />
          </Canvas>
        </SceneBoundary>
        <div className="scene-annotations">
          {snapshot.machines.map((machine) => (
            <button
              key={machine.id}
              ref={(element) => {
                if (element) labels.current.set(machine.id, element);
                else labels.current.delete(machine.id);
              }}
              className={`scene-label ${machine.id === selected ? "selected" : ""} ${area !== "All areas" && area !== machine.area ? "dimmed" : ""}`}
              style={
                {
                  "--status":
                    layer === "status"
                      ? STATUS_COLORS[machine.status]
                      : "#d8d8e3",
                } as CSSProperties
              }
              onClick={() => onSelect(machine.id)}
              title={`${machine.name} · ${STATUS_LABELS[machine.status]}`}
              aria-label={`Inspect ${machine.id}, ${machine.name}`}
            >
              <i />
              {machine.id}
            </button>
          ))}
        </div>
        {hoverMachine && (
          <div className="map-tooltip">
            <strong>{hoverMachine.name}</strong>
            <span>
              {STATUS_LABELS[hoverMachine.status]} · {hoverMachine.cycleTime}s
              cycle · {hoverMachine.queue.length} queued
            </span>
          </div>
        )}
        <div className="orbit-hint">
          Drag to orbit <i />
          Scroll to zoom <i />
          Click to inspect
        </div>
        <div className="camera-dock" aria-label="3D camera controls">
          <button
            onClick={() => moveCamera("left")}
            aria-label="Rotate left 45 degrees"
            title="Rotate left"
          >
            <ChevronLeft size={16} />
          </button>
          <output className="camera-angle" aria-label="Camera rotation">
            {angle}°
          </output>
          <button
            onClick={() => moveCamera("right")}
            aria-label="Rotate right 45 degrees"
            title="Rotate right"
          >
            <ChevronRight size={16} />
          </button>
          <i />
          <button
            onClick={() => moveCamera("out")}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus size={15} />
          </button>
          <output aria-label="Camera zoom">{zoom}%</output>
          <button
            onClick={() => moveCamera("in")}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus size={15} />
          </button>
          <i />
          <button
            className={autoRotate ? "active" : ""}
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((v) => !v)}
            disabled={reducedMotion}
            aria-label="Automatic rotation"
            title={
              reducedMotion ? "Reduced motion is enabled" : "Automatic rotation"
            }
          >
            <Rotate3D size={16} />
          </button>
          <button
            onClick={() => moveCamera("top")}
            aria-label="Top view"
            title="Top view"
          >
            <ScanLine size={15} />
          </button>
          <button
            onClick={() => moveCamera("reset")}
            aria-label="Reset map view"
            title="Reset map view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
      <div className="scene-area-tabs">
        {AREAS.map((a, i) => (
          <button
            key={a}
            className={area === a ? "active" : ""}
            onClick={() =>
              onSelect(snapshot.machines.find((m) => m.area === a)!.id)
            }
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {a}
          </button>
        ))}
        <label className="station-picker">
          <span className="sr-only">Select equipment</span>
          <select
            aria-label="Select equipment"
            value={selected ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="" disabled>
              Inspect equipment
            </option>
            {snapshot.machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="map-footer">
        <div className="map-legend">
          {layer === "status" ? (
            (["running", "warning", "stopped", "idle", "blocked"] as const).map(
              (status) => (
                <span key={status}>
                  <i style={{ background: STATUS_COLORS[status] }} />
                  {STATUS_LABELS[status]}
                </span>
              ),
            )
          ) : (
            <span>
              <i style={{ background: "#f6f6f6" }} />
              High utilization
              <i style={{ background: "#647080" }} />
              Low utilization
            </span>
          )}
        </div>
        <button className="text-button" onClick={() => onSelect(constraint.id)}>
          Constraint: {constraint.id}
          <ArrowUpRight size={13} />
        </button>
      </div>
    </section>
  );
});
