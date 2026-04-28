/**
 * ChillerView Component
 *
 * This component represents the main dashboard view for the Chiller subsystem.
 * It is responsible for retrieving, processing, and visualizing temperature
 * telemetry data, including both chiller and ambient readings.
 *
 * Key Responsibilities:
 * - Fetch data from backend API endpoints (/chiller/summary and /chiller/charts)
 * - Process time-series data and compute summary statistics (min, max, mean, latest)
 * - Determine system state based on temperature thresholds (good, warning, critical)
 * - Render interactive charts (AreaChart) for temperature trends over time
 * - Display current readings, recent values, and diagnostic summaries
 * - Support dynamic time range selection and automatic data refresh
 *
 * Technologies Used:
 * - React (hooks: useState, useEffect, useMemo, useCallback)
 * - Recharts (data visualization)
 * - REST API integration (fetch)
 *
 * This component provides both real-time monitoring and historical insight into
 * the chiller system, helping identify temperature trends and potential issues.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import "../components/ChillerView.css";
import API_BASE from "../config";

const REFRESH_INTERVAL_MS = 5000;

const RANGE_OPTIONS = [
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

function formatAxisTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatExactTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function prepareEventSeries(series = []) {
  return (Array.isArray(series) ? series : []).map((point, index) => ({
    ...point,
    eventIndex: index + 1,
    displayTime: formatExactTime(point.time),
    shortTime: formatAxisTime(point.time),
  }));
}

function computeStats(series) {
  const values = (Array.isArray(series) ? series : [])
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {
      min: null,
      max: null,
      mean: null,
      latest: null,
      count: 0,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const latest = values[values.length - 1];

  return {
    min,
    max,
    mean,
    latest,
    count: values.length,
  };
}

function getChillerState(temp) {
  const value = Number(temp);

  if (!Number.isFinite(value)) return "pending";
  if (value >= 27) return "critical";
  if (value >= 24) return "warning";
  return "good";
}

function getChillerStatusLabel(state) {
  if (state === "good") return "Stable";
  if (state === "warning") return "Elevated";
  if (state === "critical") return "Critical";
  return "No data";
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div
      style={{
        background: "rgba(10, 20, 40, 0.95)",
        border: "1px solid rgba(140,170,255,0.2)",
        borderRadius: "12px",
        padding: "10px 14px",
        color: "#f5f8ff",
        fontSize: "12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#9fb0cb", marginBottom: 4 }}>
        {new Date(label).toLocaleString()}
      </div>

      {payload.map((entry, index) => (
        <div key={index} style={{ display: "flex", gap: 8 }}>
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ChillerView() {
  const [range, setRange] = useState("24h");
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, chartsRes] = await Promise.all([
        fetch(`${API_BASE}/chiller/summary?range=${range}`),
        fetch(`${API_BASE}/chiller/charts?range=${range}`),
      ]);

      const summaryJson = await summaryRes.json();
      const chartsJson = await chartsRes.json();

      if (!summaryRes.ok) {
        throw new Error(
          summaryJson.error || summaryJson.details || "Failed to load chiller summary"
        );
      }

      if (!chartsRes.ok) {
        throw new Error(
          chartsJson.error || chartsJson.details || "Failed to load chiller charts"
        );
      }

      setSummary(summaryJson);
      setCharts(chartsJson);
      setErrorMessage("");
      setLastRefresh(new Date());
    } catch (error) {
      console.error("ChillerView load error:", error);
      setErrorMessage(error.message || "Failed to load chiller telemetry.");
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

  const temperatureSeries = useMemo(
    () => prepareEventSeries(charts?.temperatureSeries),
    [charts]
  );

  const ambientSeries = useMemo(
    () => prepareEventSeries(charts?.ambientSeries),
    [charts]
  );

  const temperatureStats = useMemo(
    () => computeStats(temperatureSeries),
    [temperatureSeries]
  );

  const ambientStats = useMemo(
    () => computeStats(ambientSeries),
    [ambientSeries]
  );

  const currentTemp = Number.isFinite(Number(summary?.latestTemperature))
    ? Number(summary.latestTemperature)
    : temperatureStats.latest;

  const currentAmbient = Number.isFinite(Number(summary?.latestAmbient))
    ? Number(summary.latestAmbient)
    : ambientStats.latest;

  const state = getChillerState(currentTemp);

  if (loading) {
    return (
      <section className="chiller-root">
        <div className="chiller-summary-card">Loading chiller data...</div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="chiller-root">
        <div className="chiller-summary-card">
          <strong>Could not load chiller telemetry.</strong>
          <div style={{ marginTop: 10 }}>{errorMessage}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="chiller-root">
      <div className="chiller-topbar">
        <div>
          <span className="hero-eyebrow">Chiller Node</span>
          <h2 className="chiller-title">Chiller Technical View</h2>
          <p className="chiller-subtitle">
            Live chiller monitoring for one chiller temperature reading and one
            ambient temperature reading. Health is based on the current chiller
            temperature threshold for this setup.
          </p>
        </div>

        <div className="chiller-range-wrap">
          <label htmlFor="chiller-range" className="chiller-range-label">
            Time Range
          </label>
          <select
            id="chiller-range"
            className="chiller-range-select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <span className="chiller-range-label">
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
      </div>

      <div className="chiller-summary-grid">
        <div className={`chiller-summary-card chiller-summary-${state}`}>
          <span className="chiller-summary-label">Current Chiller Temp</span>
          <strong>{formatMetric(currentTemp, " °C", 2)}</strong>
          <span className="chiller-summary-note">
            Latest available chiller reading
          </span>
        </div>

        <div className="chiller-summary-card chiller-summary-neutral">
          <span className="chiller-summary-label">Current Ambient Temp</span>
          <strong>{formatMetric(currentAmbient, " °C", 2)}</strong>
          <span className="chiller-summary-note">
            Latest available ambient reading
          </span>
        </div>

        <div className={`chiller-summary-card chiller-summary-${state}`}>
          <span className="chiller-summary-label">Temperature Status</span>
          <strong>{getChillerStatusLabel(state)}</strong>
          <span className="chiller-summary-note">
            Thresholds: good &lt; 24°C, warning 24–26.9°C, critical ≥ 27°C
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
        }}
      >
        <div className="chiller-chart-card">
          <div className="chiller-chart-header">
            <div>
              <h3>Chiller Temperature Over Time</h3>
              <span>{temperatureSeries.length} raw points</span>
            </div>
          </div>

          <div className="chiller-chart-body">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={temperatureSeries}
                margin={{ top: 10, right: 18, left: 16, bottom: 24 }}
              >
                <defs>
                  <linearGradient id="chillerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatAxisTime}
                  tick={{ fill: "#9fb0cb", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  width={50}
                  tick={{ fill: "#9fb0cb", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
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
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="#f59e0b"
                  fill="url(#chillerGradient)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  name="Chiller Temp"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chiller-chart-card">
          <div className="chiller-chart-header">
            <div>
              <h3>Ambient Temperature Over Time</h3>
              <span>{ambientSeries.length} raw points</span>
            </div>
          </div>

          <div className="chiller-chart-body">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={ambientSeries}
                margin={{ top: 10, right: 18, left: 16, bottom: 24 }}
              >
                <defs>
                  <linearGradient id="ambientGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatAxisTime}
                  tick={{ fill: "#9fb0cb", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  width={50}
                  tick={{ fill: "#9fb0cb", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "Ambient (°C)",
                    angle: -90,
                    position: "insideLeft",
                    style: {
                      fill: "#9fb0cb",
                      fontSize: 12,
                      textAnchor: "middle",
                    },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="#60a5fa"
                  fill="url(#ambientGradient)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#60a5fa", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  name="Ambient Temp"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chiller-bottom-grid">
        <div className="chiller-panel-card">
          <span className="panel-eyebrow">Recent Readings</span>
          <h3>Latest Temperature Values</h3>

          <div className="chiller-reading-table">
            {temperatureSeries
              .slice()
              .reverse()
              .slice(0, 8)
              .map((point) => (
                <div className="chiller-reading-row" key={point.time}>
                  <span>{new Date(point.time).toLocaleString()}</span>
                  <strong>{formatMetric(point.value, " °C", 2)}</strong>
                </div>
              ))}
          </div>
        </div>

        <div className="chiller-panel-card">
          <span className="panel-eyebrow">Chiller Diagnostics</span>
          <h3>Temperature Summary</h3>

          <div className="chiller-note-list">
            <div className="chiller-note-item">
              Chiller min: {formatMetric(temperatureStats.min, " °C", 2)}
            </div>
            <div className="chiller-note-item">
              Chiller mean: {formatMetric(temperatureStats.mean, " °C", 2)}
            </div>
            <div className="chiller-note-item">
              Chiller max: {formatMetric(temperatureStats.max, " °C", 2)}
            </div>
            <div className="chiller-note-item">
              Ambient mean: {formatMetric(ambientStats.mean, " °C", 2)}
            </div>
            <div className="chiller-note-item">
              Current state: {getChillerStatusLabel(state)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChillerView;