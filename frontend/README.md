# Allur — Factory Intelligence · v2

A complete React + TypeScript frontend for an automotive factory digital twin. It combines a fully interactive 3D production floor, equipment analytics, incident review, and a scenario comparison tool.

**Backend integration (8 October 2026):** the default “Данные сервера” view polls the FastAPI server every second and uses the three-stage Allur test dataset. Scenario controls call the existing calculation module, update server state and retain session history. See [launch instructions](../docs/LAUNCH.md) for the combined application and offline Windows launch. Run the backend on port 8001 when developing with Vite; its proxy forwards `/api` requests. Vite serves the UI at `/app/`.

The original overview, analytics and scenario-lab views remain illustrative and run a deterministic production model on your device. They do not connect to Allur equipment or claim to represent the actual plant layout. The supplied Allur PNG defines the brand direction. Equipment models are original procedural Three.js geometry; the floor plan is illustrative.

## Start in VS Code

Install Node.js **22.12 or later**, open this project folder in VS Code, and open its terminal:

```bash
npm ci
npm run dev
```

Open the `Local` URL printed by Vite, usually **http://127.0.0.1:5173**. If that port is occupied, Vite selects another port and prints it.

Do not open `index.html` directly or use VS Code Live Server for the source: Vite handles TypeScript, modules, and React.

The dependency installation needs internet access. After installation, the running app needs no external services. Fonts and their licenses are bundled locally.

## Production build

```bash
npm run build
npm run preview
```

`dist/` is the production website. The delivered archive also includes a built copy. Serve it with any static web server; do not open it through `file://` because it uses JavaScript modules.

For example, with Python available:

```bash
python3 -m http.server 8080 --directory dist
```

Open **http://127.0.0.1:8080**. This method serves the already built site and does not require `npm ci`.

## Design and 3D controls

- **Brand:** exact supplied Allur PNG, rendered white inside a dark red avatar. Its source pixels and letter shapes are unchanged.
- **Visuals:** obsidian/graphite surfaces, silver equipment, red accents, high-contrast text, gradient headline, locally bundled Sora and Manrope fonts.
- **Orbit:** drag the floor with the left mouse button or one finger. Horizontal rotation is unrestricted; vertical tilt stays above the floor.
- **Zoom:** mouse wheel, trackpad pinch, two-finger pinch, or the + / − buttons.
- **Pan:** right-drag or two-finger movement. Reset restores the centered overview.
- **Camera dock:** 45° left/right steps, scale indicator, automatic rotation, top view, and reset.
- **Keyboard:** focus the factory viewport; left/right arrows rotate, + / − zoom, and Home resets. Equipment can also be selected from the dropdown.
- **Equipment inspector:** drag or zoom its independent model. Click a label/model in the floor to change equipment.
- **Motion:** pause stops production animations; reduced-motion preference disables automatic movement. Camera interaction remains available.
- **Rendering:** WebGL is required for 3D. The equipment selector and data panels remain usable if 3D is unavailable. No remote model, texture, or HDR downloads are needed.

## What is included

- **Factory Overview:** 12 selectable stations across four production areas; animated robot arms and production paths; operational and utilization layers; 360° orbit, zoom, top view, auto rotation, and expanded-map controls; linked equipment inspector; production KPIs; incidents; area summaries.
- **Line Analytics:** area filters, per-station cycle times, OEE, good/rejected counts, stopped/waiting/blocked time, status timelines, production chart, and CSV export.
- **Scenario Lab:** a frozen source snapshot; restoration delay and capacity controls; two independent projections; output, queue, and downtime comparison.
- **Demo controls:** three deterministic scenarios, day/evening shift selection, pause/resume, reset, freshness status, and a built-in guide.
- **Responsive design:** desktop, tablet, and mobile layouts; keyboard-selectable equipment; focus styles; modal keyboard behavior; reduced-motion support.

## A short presentation walkthrough

1. Start with **Paint station slowdown**. The demo starts at **11:24** in Shift A, after 3 hours and 24 minutes of simulated operation. PNT-02 has been slow for 20 minutes.
2. Press **Pause simulation** while explaining the current view. PNT-02 processes a unit in 151 seconds instead of 84 seconds. Its input buffer is filling.
3. Select the alert in **Incidents & exceptions**. Its machine opens in the inspector. Review the cycle time, buffer load, OEE, and rule-based risk explanation.
4. Press **Acknowledge**. The incident moves to reviewed state; the machine remains slow. **Investigate** records a further workflow step.
5. Select **Explore a response**. In Scenario Lab, compare restoring the booth in 5 minutes versus 30 minutes. Press **Run comparison** after changing settings.
6. Explain that the difference in good units is calculated by the simulation, not a claimed saving measured at the real factory.
7. Switch to **Stop & recovery**. Reset, then let the simulation run. The booth begins stopped, has four simulated minutes left until recovery, and restarts after about 24 real seconds at 10× speed. The incident resolves when the condition ends.
8. Show **Line Analytics**, filter to Paint Shop, and export the equipment report.

## Model and metric definitions

The production route is:

```text
BDY-01 → BDY-02 → BDY-03 → PNT-01 → PNT-02 → PNT-03
   → ASM-01 → ASM-02 → ASM-03 → QC-01 → QC-02 → QC-03
```

Each station has a finite input buffer and processes one unit at a time. The model advances in one-second steps; the UI receives ten simulated seconds every real second. It stops at the end of the eight-hour shift.

Opening work in progress is intentional: every station starts with queued units, and BDY-01 starts with six. These units were admitted before the measured shift. Consequently, an area's output count can initially exceed an upstream area's count. Conservation checks include this opening inventory.

New units arrive at the first station every 83 seconds when its buffer has space. A station can be:

| State      | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| Running    | Processing at nominal cycle time                       |
| Slow cycle | Processing with the paint slowdown active              |
| Stopped    | Unavailable due to the simulated fault                 |
| Waiting    | No input unit available                                |
| Blocked    | Finished a unit but the next input buffer is full      |
| Offline    | Supported by the data contract for future real sources |

Final inspection deterministically rejects every 37th admitted unit. Earlier stations report 100% local quality because defects are only classified at final release in this demonstration.

- **Good output:** accepted units at the selected area's final station. Whole-factory output uses QC-03. Counts across sequential stations are never summed as finished vehicles.
- **Quality:** good output / total output at that exit.
- **Plan attainment:** good output / 320-unit full-shift target.
- **Plan to time:** full-shift target × elapsed time / eight hours. The pace comparison uses this value.
- **Downtime:** cumulative stopped seconds across the filtered equipment. It is equipment time, not necessarily elapsed line downtime.
- **Utilization:** processing time / elapsed shift time.
- **OEE:** availability × performance × quality. Availability = (elapsed − stopped) / elapsed. Performance = nominal cycle × processed units / available time, capped at 100%. Waiting and blocked time reduce performance. There are no planned breaks in the demo model.
- **Current constraint:** a heuristic ranking using stop state, cycle time, and queue occupancy. It is an estimate, not an optimized process model.
- **Risk:** a transparent heuristic from active faults and buffer pressure with a displayed 30-minute horizon. It has no trained model, calibrated probability, or demonstrated predictive accuracy.

Day and evening shifts use the same illustrative model with different clock labels. Changing the shift or demo scenario resets its initial snapshot. A page refresh also resets the demo; there is no persistent database.

## Scenario comparison

Both projections clone the same current snapshot. The baseline preserves existing conditions, including scheduled recovery. The response changes only:

1. When an active paint fault ends.
2. PNT-02 effective capacity (implemented as a cycle-time multiplier).

The projected horizon is 60 minutes, shortened if the shift ends sooner. Results remain attached to their displayed snapshot time until **Run comparison** is pressed again. A settings/source warning appears if scenario controls change.

The model does not include parallel lines, alternative routes, staffing, product variants, energy, maintenance resources, or rework. Capacity changes and restoration are hypothetical operator choices, not commands sent to equipment. No financial benefit is claimed.

## Project structure

```text
src/
  App.tsx                       App shell, navigation, filters, overview
  components/
    FactoryMap.tsx              Three.js viewport, camera controls, inspector model
    FactoryScene.tsx            Procedural 3D equipment, moving robots, conveyors
    AllurLogo.tsx               Exact supplied PNG, cropped by SVG viewport
    EquipmentPanel.tsx          Equipment, history, OEE, risk explanation
    IncidentList.tsx            Linked alerts and review workflow
    Analytics.tsx               Station details and CSV export
    ScenarioLab.tsx             Response controls and comparison UI
    Charts.tsx                  Recharts production/forecast charts
    ui.tsx                      Shared cards, badges, timelines
  data/
    types.ts                    Equipment, snapshot, prediction, adapter contracts
    fixtures.ts                 Illustrative layout and cycle-time configuration
    demoAdapter.ts              Subscription and demo control boundary
  engine/
    simulation.ts               Unit movement, finite buffers, recovery, forecast
    metrics.ts                  Shared metric formulas and risk heuristic
    simulation.test.ts          Meaningful simulation and isolation checks
  styles.css                    Responsive visual system
  fonts.css                     Local font declarations
public/
  fonts/                        Bundled fonts and SIL Open Font Licenses
  favicon.svg
```

## Connect a backend later

Implement `FactoryDataAdapter` from `src/data/types.ts` with the same immutable `Snapshot` shape. Replace `createDemoAdapter` in `App.tsx` with your real source. `subscribe` can listen to a WebSocket stream, and `getSnapshot` must retain the same object until data changes, as required by React's external-store API.

Keep equipment IDs stable across map records, time series, and incidents. Define timestamp units at the adapter boundary: this demo uses seconds from shift start for production timestamps, and Unix milliseconds for `updatedAt`.

A backend prediction can implement `PredictionResponse`: equipment ID, source, condition, horizon, level, factors, and generation time. Replace `predictRisk` with the actual model response. Change the visible source label only when real model output is connected.

The demo adapter's scenario, shift, and reset methods are development controls. In a real integration, expose them only in a dedicated simulation environment. Route incident state changes to the backend incident service; never treat acknowledgment as equipment recovery.

## Verification

```bash
npm test
npm run build
```

The automated checks cover full-shift unit conservation, unique unit locations, finite buffers, complete time accounting, deterministic output, slowdown impact, recovery, immutable scenario comparison, neutral settings, incident acknowledgment, selected-area metrics, and shift boundaries.

See `VERIFICATION.md` for the checks performed on the delivered version.

## Fonts and assets

Manrope and Sora are bundled with their SIL Open Font License texts in `public/fonts/`. Icons come from `lucide-react`. The supplied Allur PNG is the only external brand image. The project includes no proprietary factory models.

## Logo attribution

Attribution supplied with the logo and shown at the bottom of the interface:

Авторство: Allur. [allur.kz](https://allur.kz/) · [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) · [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?curid=150018122).

The PNG is stored in `public/assets/allur-logo.png`. CSS renders its nontransparent pixels white; an SVG viewport crops only the surrounding transparent margin. Sora and Manrope license files are included in `public/fonts/`.
