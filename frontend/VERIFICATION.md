# Проверка интеграции — 8 октября 2026

Актуальная проверка описана в [../docs/AUDIT.md](../docs/AUDIT.md). Серверный экран теперь показывает числовой результат обученной экспериментальной модели. Следующий раздел — исторические заметки о версии исходного демонстрационного frontend, до подключения Python backend.

# Version 2 delivery notes

Updated locally on 7 October 2026.

## Compilation

TypeScript compilation and Vite production bundling completed successfully. Three.js and chart code are split into separate bundles. Vite reports a size advisory for the Three.js bundle; this is not a compilation error.

## UI observations

- The supplied Allur PNG appears as a white wordmark inside a dark red avatar.
- The overview renders graphite panels, the gradient heading, production metrics, the interactive floor, and a separate selected-equipment model.
- Camera buttons changed the visible rotation from 39° to 84° and the zoom from 100% to 125%; reset restores the overview.
- A 390px viewport rendered stacked panels and a usable camera dock. The document width and scroll width both measured 383px after the browser scrollbar.
- Attribution links appear at the bottom of the interface.
- Navigating to Line Analytics and back to the overview completed after the 3D label update; no new console errors or warnings were recorded during the final navigation.
- `preview.jpg` records the version 2 implementation.

The existing simulation tests were retained and were not rerun for this visual update. The simulation engine is unchanged. Version 1's previous test results are not claimed as fresh version 2 results.

## Practical limits

This is a frontend demonstration with illustrative factory data and procedural equipment models. It has no live factory integration, trained prediction model, authentication service, or persistent incident database. Interactive 3D requires WebGL; equipment data and the selector remain available if the renderer is unavailable.
