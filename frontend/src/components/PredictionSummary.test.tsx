import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PredictionSummary, type ModelPrediction } from "./PredictionSummary";

const modelResponse: ModelPrediction = {
  available: true,
  mode: "experimental_external_benchmark",
  score_pct: 71.4,
  line_name: "Сварка",
  label: "Повышенный экспериментальный риск",
  horizon: "следующая сменная запись той же линии",
  per_line: [
    { line_id: "welding", name: "Сварка", score_pct: 71.4, label: "Повышенный экспериментальный риск", drivers: ["доступность по runtime"] },
    { line_id: "painting", name: "Окраска", score_pct: 41.2, label: "Ниже порога экспериментальной модели", drivers: ["оценка основана на последней агрегированной записи"] },
    { line_id: "assembly", name: "Сборка", score_pct: 18.6, label: "Ниже порога экспериментальной модели", drivers: ["выход годной продукции"] },
  ],
  limitations: ["External benchmark; this score is not calibrated to the factory."],
};

test("renders observed-date model score, target event, and each API line prediction", () => {
  const html = renderToStaticMarkup(createElement(PredictionSummary, { prediction: modelResponse, date: "2026-10-02" }));
  assert.match(html, /наблюдаемые данные на 2026-10-02/);
  assert.match(html, /Оценка модели: 71\.4%/);
  assert.match(html, /нескалиброванный балл, не вероятность/);
  assert.match(html, /не менее 60 минут незапланированного простоя/);
  assert.match(html, /Сварка — 71\.4%; Окраска — 41\.2%; Сборка — 18\.6%/);
  assert.match(html, /External benchmark/);
});

test("does not show a score or event target when model inference is unavailable", () => {
  const unavailable: ModelPrediction = {
    available: false,
    label: "Модель не обучена",
    score_pct: null,
    limitations: ["trained model missing"],
  };
  const html = renderToStaticMarkup(createElement(PredictionSummary, { prediction: unavailable, date: "2026-10-02" }));
  assert.match(html, /Модель не обучена/);
  assert.match(html, /trained model missing/);
  assert.doesNotMatch(html, /Оценка модели:/);
  assert.doesNotMatch(html, /Целевое событие модели:/);
});
