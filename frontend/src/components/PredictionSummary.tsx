import { Fragment } from "react";

export type ModelLinePrediction = {
  line_id: string;
  name: string;
  score_pct: number;
  label: string;
  drivers: string[];
};

export type ModelPrediction = {
  available: boolean;
  label: string;
  score_pct: number | null;
  mode?: string;
  line_name?: string;
  horizon?: string;
  per_line?: ModelLinePrediction[];
  limitations: string[];
};

export function PredictionSummary({ prediction, date }: { prediction: ModelPrediction; date: string }) {
  return <>
    <p><b>Экспериментальная ML-модель · наблюдаемые данные на {date}:</b> {prediction.label}</p>
    {prediction.available && prediction.score_pct != null && <p>
      Оценка модели: {prediction.score_pct}%{prediction.line_name ? ` · ${prediction.line_name}` : ""}. Это нескалиброванный балл, не вероятность.
      {prediction.horizon ? ` Горизонт: ${prediction.horizon}.` : ""}
    </p>}
    {prediction.available && !!prediction.per_line?.length && <p>
      Оценки по участкам: {prediction.per_line.map((line, index) => <Fragment key={line.line_id}>
        {index > 0 ? "; " : ""}{line.name} — {line.score_pct}%
      </Fragment>)}.
    </p>}
    {prediction.available && <p>Целевое событие модели: не менее 60 минут незапланированного простоя в следующей записи той же линии.</p>}
    {prediction.available && !!prediction.per_line?.length && <p>Факторы самой высокой оценки: {prediction.per_line[0].drivers.join(", ")}.</p>}
    <p className="case-note">{prediction.limitations?.join(" ")}</p>
  </>;
}
