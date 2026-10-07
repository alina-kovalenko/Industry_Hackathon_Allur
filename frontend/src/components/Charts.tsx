import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { AreaFilter, ForecastResult, Snapshot } from "../data/types";
import { clockLabel, getMetrics } from "../engine/metrics";
import { SHIFT_SECONDS } from "../data/fixtures";

const tooltipStyle = {
  background: "#19191d",
  border: "1px solid #393940",
  borderRadius: 8,
  color: "#f5f5f7",
  fontSize: 12,
};
export function ProductionChart({
  snapshot,
  area = "All areas",
  height = 188,
}: {
  snapshot: Snapshot;
  area?: AreaFilter;
  height?: number;
}) {
  const data = snapshot.trend.map((point) => ({
    time: point.time,
    good: area === "All areas" ? point.good : point.areas[area].good,
    plan: Math.round(point.target),
  }));
  if (snapshot.trend.at(-1)?.time !== snapshot.elapsed) {
    data.push({
      time: snapshot.elapsed,
      good: getMetrics(snapshot, area).good,
      plan: Math.round(
        (snapshot.shiftTarget * snapshot.elapsed) / SHIFT_SECONDS,
      ),
    });
  }
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 10, bottom: 0, left: -22 }}
        >
          <defs>
            <linearGradient id="production-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97066" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#f97066" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="#29292f"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(value) => clockLabel(Number(value), snapshot.shift)}
            axisLine={false}
            tickLine={false}
            minTickGap={45}
            tick={{ fill: "#92929e", fontSize: 10 }}
            dy={7}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#92929e", fontSize: 10 }}
          />
          <Tooltip
            labelFormatter={(value) =>
              clockLabel(Number(value), snapshot.shift)
            }
            contentStyle={tooltipStyle}
            labelStyle={{ color: "#d1d1da" }}
          />
          <Area
            name="Plan to time"
            type="linear"
            dataKey="plan"
            stroke="#a5a5b2"
            strokeDasharray="5 4"
            fill="none"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Area
            name="Good units"
            type="monotone"
            dataKey="good"
            stroke="#f97066"
            fill="url(#production-fill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ForecastChart({ result }: { result: ForecastResult }) {
  return (
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={result.series}
          margin={{ top: 12, left: -15, right: 20, bottom: 5 }}
        >
          <CartesianGrid
            stroke="#29292f"
            vertical={false}
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="minutes"
            tickFormatter={(value) => `+${value}m`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#92929e", fontSize: 11 }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#92929e", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(value) => `${value} minutes ahead`}
          />
          <Legend
            wrapperStyle={{ paddingTop: 18, fontSize: 12 }}
            iconType="plainline"
          />
          <Line
            name="Current conditions"
            dataKey="baseline"
            stroke="#a5a5b2"
            strokeDasharray="6 5"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            name="With your response"
            dataKey="response"
            stroke="#f97066"
            dot={false}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
