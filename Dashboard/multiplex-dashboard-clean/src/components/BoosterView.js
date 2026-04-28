/**
 * BoosterView Component
 *
 * This component represents the main dashboard view for the Booster subsystem.
 * It is responsible for fetching, processing, and visualizing real-time and historical
 * telemetry data including current, power, and temperature.
 *
 * Key Responsibilities:
 * - Fetch data from backend API endpoints (/booster/summary and /booster/charts)
 * - Process time-series data for visualization and statistical analysis
 * - Apply filtering (e.g., smoothing isolated spikes) for more accurate system evaluation
 * - Compute metrics such as min, max, mean, median, and latest values
 * - Render multiple interactive charts (Line, Bar, Area) using Recharts
 * - Display system status, electrical load, and activity summaries
 * - Support dynamic time range selection and auto-refresh behavior
 *
 * Technologies Used:
 * - React (hooks: useState, useEffect, useMemo, useCallback)
 * - Recharts (data visualization)
 * - REST API integration (fetch)
 *
 * This component serves as the primary interface for monitoring the electrical
 * behavior of the booster system and supports both operational insight and
 * technical diagnostics.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import "./BoosterView.css";
import API_BASE from "../config";

const REFRESH_INTERVAL_MS = 5000;

const RANGE_OPTIONS = [
  { value: "15m", label: "Last 15 min" },
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function formatMetric(value, suffix = "", digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num.toFixed(digits)}${suffix}`;
}

function formatExactTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatShortTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function prepareEventSeries(series = [], forceAbsolute = false) {
  return (Array.isArray(series) ? series : []).map((point, index) => {
    const rawValue = Number(point.value);
    const cleanValue = forceAbsolute ? Math.abs(rawValue) : rawValue;

    return {
      ...point,
      value: Number.isFinite(cleanValue) ? cleanValue : null,
      eventIndex: index + 1,
      displayTime: formatExactTime(point.time),
      shortTime: formatShortTime(point.time),
    };
  });
}

function computeSeriesStats(series = []) {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      min: null,
      mean: null,
      median: null,
      max: null,
      latest: null,
      count: 0,
    };
  }

  const values = series
    .map((item) =>
      Number.isFinite(Number(item.value)) ? Number(item.value) : Number(item)
    )
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return {
      min: null,
      mean: null,
      median: null,
      max: null,
      latest: null,
      count: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];

  return { min, mean, median, max, latest, count: values.length };
}

/*
  Smooth only isolated one-point spikes so startup/inrush transients
  do not trigger warnings. The raw charts still show the true signal.
*/
function smoothIsolatedSpikes(
  series = [],
  spikeThreshold = 1.8,
  neighborMax = 1.2
) {
  if (!Array.isArray(series) || series.length < 3) return series;

  return series.map((point, index) => {
    if (index === 0 || index === series.length - 1) return point;

    const prev = Number(series[index - 1]?.value);
    const curr = Number(point?.value);
    const next = Number(series[index + 1]?.value);

    const prevValid = Number.isFinite(prev);
    const currValid = Number.isFinite(curr);
    const nextValid = Number.isFinite(next);

    if (!prevValid || !currValid || !nextValid) return point;

    const isIsolatedSpike =
      curr >= spikeThreshold && prev <= neighborMax && next <= neighborMax;

    if (!isIsolatedSpike) return point;

    const replacement = (prev + next) / 2;

    return {
      ...point,
      value: Number(replacement.toFixed(2)),
      wasSmoothedSpike: true,
      rawValue: curr,
    };
  });
}

/*
  Tuned for your real motor behavior:
  - normal current usually around 0.5 to <1.0 A
  - negative values are wiring-related and displayed as absolute values
*/
function getTempTone(temp) {
  if (temp <= 28) return "good";
  if (temp <= 34) return "warning";
  return "critical";
}

function getLoadTone(current, power) {
  if (current <= 1.1 && power <= 15) return "good";
  if (current <= 1.6 && power <= 24) return "warning";
  return "critical";
}

function getBoosterStatusFromLiveData(current, power, temperature) {
  if (
    !Number.isFinite(current) &&
    !Number.isFinite(power) &&
    !Number.isFinite(temperature)
  ) {
    return "Awaiting data";
  }

  if (current > 1.6 || power > 24) return "High electrical load";
  if (temperature > 34) return "Temperature elevated";
  return "Stable operation";
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload;

  return (
    <div className="booster-tooltip">
      <div className="booster-tooltip-time">{point?.displayTime || "--"}</div>
      <div className="booster-tooltip-row">
        <span style={{ color: payload[0].color }}>{payload[0].name}</span>
        <strong>{payload[0].value}</strong>
      </div>
      <div className="booster-tooltip-row">
        <span>Event</span>
        <strong>#{point?.eventIndex}</strong>
      </div>
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="booster-stat-pill">
      <span className="booster-stat-pill-label">{label}</span>
      <strong className="booster-stat-pill-value">{value}</strong>
    </div>
  );
}

function ChartCard({ title, subtitle, children, stats = [] }) {
  return (
    <div className="booster-chart-card">
      <div className="booster-chart-card-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <div className="booster-chart-subtitle">{subtitle}</div> : null}
        </div>
      </div>

      <div className="booster-chart-card-body">{children}</div>

      {stats.length > 0 && (
        <div className="booster-chart-stats-row">
          {stats.map((stat) => (
            <StatPill key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({ status }) {
  const tone =
    status === "Stable operation"
      ? "good"
      : status === "Temperature elevated"
      ? "warning"
      : status === "High electrical load"
      ? "warning"
      : "neutral";

  return (
    <div className={`booster-summary-card booster-summary-${tone}`}>
      <span className="booster-summary-label">System Status</span>
      <div className="booster-status-value">{status}</div>
      <span className="booster-summary-sublabel">
        Status thresholds are tuned to the current motor behavior range.
      </span>
    </div>
  );
}

function TemperatureCard({ temperature }) {
  const tone = getTempTone(temperature);

  return (
    <div className={`booster-summary-card booster-summary-${tone}`}>
      <span className="booster-summary-label">Booster Temperature</span>
      <div className="booster-summary-value">
        {formatMetric(temperature, " °C", 1)}
      </div>
      <span className="booster-summary-sublabel">
        Temperature measured near the booster motor assembly.
      </span>
    </div>
  );
}

function LoadCard({ current, power }) {
  const tone = getLoadTone(current, power);

  const currentPercent = Math.max(
    8,
    Math.min(100, (Number(current) / 2.0) * 100)
  );
  const powerPercent = Math.max(
    8,
    Math.min(100, (Number(power) / 30) * 100)
  );

  return (
    <div className={`booster-summary-card booster-summary-${tone}`}>
      <span className="booster-summary-label">Electrical Load</span>

      <div className="booster-activity-stack">
        <div className="booster-activity-row">
          <div className="booster-activity-row-top">
            <span className="booster-activity-title">Current</span>
            <strong className="booster-activity-value">
              {formatMetric(current, " A", 2)}
            </strong>
          </div>
          <div className="booster-activity-progress">
            <div
              className={`booster-activity-progress-fill booster-activity-progress-fill-${tone}`}
              style={{ width: `${currentPercent}%` }}
            />
          </div>
        </div>

        <div className="booster-activity-row">
          <div className="booster-activity-row-top">
            <span className="booster-activity-title">Power</span>
            <strong className="booster-activity-value">
              {formatMetric(power, " W", 1)}
            </strong>
          </div>
          <div className="booster-activity-progress">
            <div
              className={`booster-activity-progress-fill booster-activity-progress-fill-${tone}`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ readingCount, meanCurrent }) {
  return (
    <div className="booster-summary-card booster-summary-neutral">
      <span className="booster-summary-label">Activity Summary</span>
      <div className="booster-info-grid">
        <div className="booster-info-item">
          <span>Readings</span>
          <strong>{formatMetric(readingCount, "", 0)}</strong>
        </div>
        <div className="booster-info-item">
          <span>Mean Current</span>
          <strong>{formatMetric(meanCurrent, " A", 2)}</strong>
        </div>
      </div>
      <span className="booster-summary-sublabel">
        Technician-facing overview for the selected range.
      </span>
    </div>
  );
}

function BoosterView() {
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [range, setRange] = useState("24h");
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, chartsRes] = await Promise.all([
        fetch(`${API_BASE}/booster/summary?range=${range}`),
        fetch(`${API_BASE}/booster/charts?range=${range}`),
      ]);

      const summaryJson = await summaryRes.json();
      const chartsJson = await chartsRes.json();

      if (!summaryRes.ok) {
        throw new Error(
          summaryJson.error || summaryJson.details || "Failed to load summary"
        );
      }

      if (!chartsRes.ok) {
        throw new Error(
          chartsJson.error || chartsJson.details || "Failed to load charts"
        );
      }

      setSummary(summaryJson);
      setCharts(chartsJson);
      setErrorMessage("");
      setLastRefresh(new Date());
    } catch (error) {
      console.error("BoosterView load error:", error);
      setErrorMessage(error.message || "Failed to load booster telemetry.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    async function runFetch() {
      if (!isMounted) return;
      await fetchAll();
    }

    setLoading(true);
    runFetch();
    intervalId = setInterval(runFetch, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [fetchAll]);

  const currentSeries = useMemo(
    () => prepareEventSeries(charts?.currentSeries, true),
    [charts]
  );

  const powerSeries = useMemo(
    () => prepareEventSeries(charts?.powerSeries, true),
    [charts]
  );

  const temperatureSeries = useMemo(
    () => prepareEventSeries(charts?.temperatureSeries),
    [charts]
  );

  /*
    Filtered series are used for status + summary logic only.
    Raw series are still used in the visible charts so technicians
    can see the actual transient spikes.
  */
  const filteredCurrentSeries = useMemo(
    () => smoothIsolatedSpikes(currentSeries, 1.8, 1.2),
    [currentSeries]
  );

  const filteredPowerSeries = useMemo(
    () => smoothIsolatedSpikes(powerSeries, 26, 15),
    [powerSeries]
  );

  const filteredUnifiedSeries = useMemo(() => {
    if (!filteredCurrentSeries.length) return [];

    return filteredCurrentSeries.map((currentPoint, index) => ({
      ...currentPoint,
      current: currentPoint.value,
      power: filteredPowerSeries[index]?.value ?? null,
      temperature: temperatureSeries[index]?.value ?? null,
    }));
  }, [filteredCurrentSeries, filteredPowerSeries, temperatureSeries]);

  const rawUnifiedSeries = useMemo(() => {
    if (!currentSeries.length) return [];

    return currentSeries.map((currentPoint, index) => ({
      ...currentPoint,
      current: currentPoint.value,
      power: powerSeries[index]?.value ?? null,
      temperature: temperatureSeries[index]?.value ?? null,
    }));
  }, [currentSeries, powerSeries, temperatureSeries]);

  const loadEventsSeries = useMemo(
    () => filteredUnifiedSeries,
    [filteredUnifiedSeries]
  );

  const currentStats = useMemo(() => {
    const normalized = filteredUnifiedSeries
      .map((item) => ({ value: item.current }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [filteredUnifiedSeries]);

  const powerStats = useMemo(() => {
    const normalized = filteredUnifiedSeries
      .map((item) => ({ value: item.power }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [filteredUnifiedSeries]);

  const tempStats = useMemo(() => {
    const normalized = filteredUnifiedSeries
      .map((item) => ({ value: item.temperature }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [filteredUnifiedSeries]);

  const loadEventStats = useMemo(() => {
    const normalized = loadEventsSeries
      .map((item) => ({ value: item.power }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [loadEventsSeries]);

  const liveCurrent =
    currentStats.latest ?? Math.abs(Number(summary?.latestCurrent) || 0);

  const livePower =
    powerStats.latest ?? Math.abs(Number(summary?.latestPower) || 0);

  const liveTemperature =
    tempStats.latest ?? (Number(summary?.latestTemperature) || 0);

  const liveStatus = getBoosterStatusFromLiveData(
    liveCurrent,
    livePower,
    liveTemperature
  );

  if (loading) {
    return (
      <section className="booster-root">
        <div className="booster-loading-card">Loading booster telemetry...</div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="booster-root">
        <div className="booster-loading-card">
          <strong>Could not load booster telemetry.</strong>
          <div style={{ marginTop: 10 }}>{errorMessage}</div>
        </div>
      </section>
    );
  }

  if (!summary || !charts) {
    return (
      <section className="booster-root">
        <div className="booster-loading-card">No booster data available.</div>
      </section>
    );
  }

  return (
    <section className="booster-root">
      <div className="booster-toolbar">
        <div className="booster-range-note">
          Showing booster telemetry for: <strong>{summary.rangeLabel || range}</strong>
          <span className="booster-auto-refresh-note">
            Auto-refresh: 5s
            {lastRefresh
              ? ` · Last refresh ${lastRefresh.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : ""}
          </span>
        </div>

        <div className="booster-range-select-wrap">
          <label className="booster-range-label" htmlFor="booster-range-select">
            Time Range
          </label>
          <select
            id="booster-range-select"
            className="booster-range-select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="booster-summary-grid">
        <LoadCard current={liveCurrent} power={livePower} />
        <TemperatureCard temperature={liveTemperature} />
        <StatusCard status={liveStatus} />
        <InfoCard readingCount={currentStats.count} meanCurrent={currentStats.mean} />
      </div>

      <div className="booster-chart-grid">
        <ChartCard
          title="Current Over Time"
          subtitle={`${rawUnifiedSeries.length} raw motor current events`}
          stats={[
            { label: "Min", value: formatMetric(currentStats.min, " A", 2) },
            { label: "Mean", value: formatMetric(currentStats.mean, " A", 2) },
            { label: "Median", value: formatMetric(currentStats.median, " A", 2) },
            { label: "Max", value: formatMetric(currentStats.max, " A", 2) },
            { label: "Latest", value: formatMetric(currentStats.latest, " A", 2) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={rawUnifiedSeries}
              margin={{ top: 10, right: 18, left: 24, bottom: 26 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => rawUnifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded event time",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#9fb0cb",
                  fontSize: 12,
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                width={56}
                label={{
                  value: "Current (A)",
                  angle: -90,
                  position: "insideLeft",
                  style: {
                    fill: "#9fb0cb",
                    fontSize: 12,
                    textAnchor: "middle",
                  },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="linear"
                dataKey="current"
                name="Current"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#60a5fa", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Power Consumption Over Time"
          subtitle={`${rawUnifiedSeries.length} raw power readings`}
          stats={[
            { label: "Min", value: formatMetric(powerStats.min, " W", 1) },
            { label: "Mean", value: formatMetric(powerStats.mean, " W", 1) },
            { label: "Median", value: formatMetric(powerStats.median, " W", 1) },
            { label: "Max", value: formatMetric(powerStats.max, " W", 1) },
            { label: "Latest", value: formatMetric(powerStats.latest, " W", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={rawUnifiedSeries}
              margin={{ top: 10, right: 18, left: 18, bottom: 26 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => rawUnifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded event time",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#9fb0cb",
                  fontSize: 12,
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                width={52}
                label={{
                  value: "Power (W)",
                  angle: -90,
                  position: "insideLeft",
                  style: {
                    fill: "#9fb0cb",
                    fontSize: 12,
                    textAnchor: "middle",
                  },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="power"
                name="Power"
                fill="#ffb43b"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Booster Temperature Over Time"
          subtitle={`${rawUnifiedSeries.length} raw temperature readings`}
          stats={[
            { label: "Min", value: formatMetric(tempStats.min, " °C", 1) },
            { label: "Mean", value: formatMetric(tempStats.mean, " °C", 1) },
            { label: "Median", value: formatMetric(tempStats.median, " °C", 1) },
            { label: "Max", value: formatMetric(tempStats.max, " °C", 1) },
            { label: "Latest", value: formatMetric(tempStats.latest, " °C", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={rawUnifiedSeries}
              margin={{ top: 10, right: 18, left: 18, bottom: 26 }}
            >
              <defs>
                <linearGradient id="boosterTempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => rawUnifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded event time",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#9fb0cb",
                  fontSize: 12,
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                width={58}
                label={{
                  value: "Temperature (°C)",
                  angle: -90,
                  position: "insideLeft",
                  style: {
                    fill: "#9fb0cb",
                    fontSize: 12,
                    textAnchor: "middle",
                  },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="linear"
                dataKey="temperature"
                name="Temperature"
                stroke="#34d399"
                fill="url(#boosterTempGradient)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#34d399", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Load Events"
          subtitle={`${loadEventsSeries.length} filtered booster events`}
          stats={[
            { label: "Min", value: formatMetric(loadEventStats.min, " W", 1) },
            { label: "Mean", value: formatMetric(loadEventStats.mean, " W", 1) },
            { label: "Median", value: formatMetric(loadEventStats.median, " W", 1) },
            { label: "Max", value: formatMetric(loadEventStats.max, " W", 1) },
            { label: "Latest", value: formatMetric(loadEventStats.latest, " W", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={loadEventsSeries}
              margin={{ top: 10, right: 18, left: 18, bottom: 26 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => loadEventsSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded event time",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#9fb0cb",
                  fontSize: 12,
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                width={56}
                label={{
                  value: "Power (W)",
                  angle: -90,
                  position: "insideLeft",
                  style: {
                    fill: "#9fb0cb",
                    fontSize: 12,
                    textAnchor: "middle",
                  },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="power"
                name="Load"
                fill="#ff5a6a"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}

export default BoosterView;