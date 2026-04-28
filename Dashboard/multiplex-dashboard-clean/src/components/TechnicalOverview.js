/*
  TechnicalOverview

  This component provides a system-level dashboard combining data from
  all three nodes: Dispenser, Booster, and Chiller.

  It fetches summary + chart data from each API endpoint and presents:
  - High-level system health (good / warning / critical)
  - Key metrics for each subsystem
  - Trend visualizations for quick diagnostics

  This view is intended for technician-level monitoring to quickly
  identify abnormal behavior across the full system.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import "./TechnicalOverview.css";
import API_BASE from "../config";

const REFRESH_INTERVAL_MS = 5000;
const RANGE = "30d";

function formatMetric(value, suffix = "", digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num.toFixed(digits)}${suffix}`;
}

function formatAxisTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const safeLabel = label ? new Date(label) : null;
  const labelText =
    safeLabel && !Number.isNaN(safeLabel.getTime())
      ? safeLabel.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : String(label ?? "--");

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
      <div style={{ color: "#9fb0cb", marginBottom: 6 }}>{labelText}</div>

      {payload.map((entry, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 2,
          }}
        >
          <span style={{ color: entry.color || "#9fb0cb" }}>{entry.name}:</span>
          <strong style={{ color: "#ffffff" }}>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

function detectChillerSpikeCount(series = [], riseThreshold = 2.5) {
  if (!Array.isArray(series) || series.length < 3) return 0;

  let count = 0;

  for (let i = 1; i < series.length - 1; i += 1) {
    const prev = Number(series[i - 1]?.value);
    const curr = Number(series[i]?.value);
    const next = Number(series[i + 1]?.value);

    if (
      !Number.isFinite(prev) ||
      !Number.isFinite(curr) ||
      !Number.isFinite(next)
    ) {
      continue;
    }

    const neighborAverage = (prev + next) / 2;
    const jumpAboveNeighbors = curr - neighborAverage;
    const riseFromPrev = curr - prev;
    const dropToNext = curr - next;

    const isSpike =
      jumpAboveNeighbors >= riseThreshold &&
      riseFromPrev >= riseThreshold &&
      dropToNext >= riseThreshold;

    if (isSpike) count += 1;
  }

  return count;
}

function getStatusMeta(state) {
  if (state === "good") {
    return { label: "Healthy", className: "good" };
  }
  if (state === "warning") {
    return { label: "Warning", className: "warning" };
  }
  if (state === "critical") {
    return { label: "Critical", className: "critical" };
  }
  return { label: "Pending", className: "pending" };
}

function SummaryCard({ title, state, metrics, onOpen }) {
  const meta = getStatusMeta(state);

  return (
    <div className="tech-summary-card">
      <div className="tech-summary-top">
        <div className="tech-summary-title-wrap">
          <span className={`tech-status-dot tech-status-dot-${meta.className}`} />
          <h3>{title}</h3>
        </div>
      </div>

      <div className={`tech-status-badge tech-status-badge-${meta.className}`}>
        {meta.label}
      </div>

      <div className="tech-summary-metrics">
        {metrics.map((metric) => (
          <div className="tech-summary-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmallChartCard({
  title,
  subtitle,
  data,
  color = "#60a5fa",
  dataKey = "value",
  yLabel = "",
  type = "area",
}) {
  const gradientId = `grad-${title.replace(/\s+/g, "-")}`;

  return (
    <div className="tech-chart-card">
      <div className="tech-chart-card-header">
        <div>
          <h3>{title}</h3>
          <span>{subtitle}</span>
        </div>
      </div>

      <div className="tech-chart-card-body">
        <ResponsiveContainer width="100%" height={220}>
          {type === "bar" ? (
            <BarChart
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 12 }}
            >
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
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                label={
                  yLabel
                    ? {
                        value: yLabel,
                        angle: -90,
                        position: "insideLeft",
                        style: {
                          fill: "#9fb0cb",
                          fontSize: 12,
                          textAnchor: "middle",
                        },
                      }
                    : undefined
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey={dataKey}
                fill={color}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
                name={title}
              />
            </BarChart>
          ) : type === "line" ? (
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 12 }}
            >
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
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                label={
                  yLabel
                    ? {
                        value: yLabel,
                        angle: -90,
                        position: "insideLeft",
                        style: {
                          fill: "#9fb0cb",
                          fontSize: 12,
                          textAnchor: "middle",
                        },
                      }
                    : undefined
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="linear"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                name={title}
              />
            </LineChart>
          ) : (
            <AreaChart
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 12 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.04} />
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
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                label={
                  yLabel
                    ? {
                        value: yLabel,
                        angle: -90,
                        position: "insideLeft",
                        style: {
                          fill: "#9fb0cb",
                          fontSize: 12,
                          textAnchor: "middle",
                        },
                      }
                    : undefined
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="linear"
                dataKey={dataKey}
                stroke={color}
                fill={`url(#${gradientId})`}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                name={title}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TechnicalOverview({ onOpenTab }) {
  const [dispenserSummary, setDispenserSummary] = useState(null);
  const [dispenserCharts, setDispenserCharts] = useState(null);
  const [boosterSummary, setBoosterSummary] = useState(null);
  const [boosterCharts, setBoosterCharts] = useState(null);
  const [chillerSummary, setChillerSummary] = useState(null);
  const [chillerCharts, setChillerCharts] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchOverviewData = useCallback(async () => {
    try {
      const [
        dispSummaryRes,
        dispChartsRes,
        boostSummaryRes,
        boostChartsRes,
        chillSummaryRes,
        chillChartsRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/dispenser/summary?range=${RANGE}`),
        fetch(`${API_BASE}/dispenser/charts?range=${RANGE}`),
        fetch(`${API_BASE}/booster/summary?range=${RANGE}`),
        fetch(`${API_BASE}/booster/charts?range=${RANGE}`),
        fetch(`${API_BASE}/chiller/summary?range=${RANGE}`),
        fetch(`${API_BASE}/chiller/charts?range=${RANGE}`),
      ]);

      const [
        dispSummaryJson,
        dispChartsJson,
        boostSummaryJson,
        boostChartsJson,
        chillSummaryJson,
        chillChartsJson,
      ] = await Promise.all([
        dispSummaryRes.json(),
        dispChartsRes.json(),
        boostSummaryRes.json(),
        boostChartsRes.json(),
        chillSummaryRes.json(),
        chillChartsRes.json(),
      ]);

      if (!dispSummaryRes.ok) {
        throw new Error(
          dispSummaryJson.error ||
            dispSummaryJson.details ||
            "Dispenser summary failed"
        );
      }

      if (!dispChartsRes.ok) {
        throw new Error(
          dispChartsJson.error ||
            dispChartsJson.details ||
            "Dispenser charts failed"
        );
      }

      if (!boostSummaryRes.ok) {
        throw new Error(
          boostSummaryJson.error ||
            boostSummaryJson.details ||
            "Booster summary failed"
        );
      }

      if (!boostChartsRes.ok) {
        throw new Error(
          boostChartsJson.error ||
            boostChartsJson.details ||
            "Booster charts failed"
        );
      }

      if (!chillSummaryRes.ok) {
        throw new Error(
          chillSummaryJson.error ||
            chillSummaryJson.details ||
            "Chiller summary failed"
        );
      }

      if (!chillChartsRes.ok) {
        throw new Error(
          chillChartsJson.error ||
            chillChartsJson.details ||
            "Chiller charts failed"
        );
      }

      setDispenserSummary(dispSummaryJson);
      setDispenserCharts(dispChartsJson);
      setBoosterSummary(boostSummaryJson);
      setBoosterCharts(boostChartsJson);
      setChillerSummary(chillSummaryJson);
      setChillerCharts(chillChartsJson);
      setLastRefresh(new Date());
      setErrorMessage("");
    } catch (error) {
      console.error("Technical overview fetch failed:", error);
      setErrorMessage(error.message || "Failed to load technical overview.");
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
    const intervalId = setInterval(fetchOverviewData, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchOverviewData]);

  const dispenserDurationSeries = dispenserCharts?.durationSeries || [];
  const dispenserWaterSeries = dispenserCharts?.waterSeries || [];
  const dispenserSyrupSeries = dispenserCharts?.syrupSeries || [];

  const boosterCurrentSeries = (boosterCharts?.currentSeries || []).map(
    (item) => ({
      ...item,
      value: Math.abs(Number(item.value) || 0),
    })
  );

  const boosterPowerSeries = (boosterCharts?.powerSeries || []).map((item) => ({
    ...item,
    value: Math.abs(Number(item.value) || 0),
  }));

  const boosterTemperatureSeries = boosterCharts?.temperatureSeries || [];

  const chillerTemperatureSeries = chillerCharts?.temperatureSeries || [];
  const chillerAmbientSeries = chillerCharts?.ambientSeries || [];

  const chillerSpikeCount = useMemo(
    () =>
      detectChillerSpikeCount(chillerTemperatureSeries, 2.5) +
      detectChillerSpikeCount(chillerAmbientSeries, 2.5),
    [chillerTemperatureSeries, chillerAmbientSeries]
  );

  const dispenserState = useMemo(() => {
    if (!dispenserSummary) return "pending";
    if (!dispenserSummary.syrupRemainingEnabled) return "pending";
    if (Number(dispenserSummary.syrupRemaining) <= 30) return "warning";
    if (Number(dispenserSummary.avgPressDuration) > 3500) return "warning";
    return "good";
  }, [dispenserSummary]);

  const boosterState = useMemo(() => {
    if (!boosterSummary) return "pending";
    if (
      Math.abs(Number(boosterSummary.latestCurrent) || 0) > 1.6 ||
      Math.abs(Number(boosterSummary.latestPower) || 0) > 24
    ) {
      return "warning";
    }
    if (Number(boosterSummary.latestTemperature) > 34) return "warning";
    return "good";
  }, [boosterSummary]);

  const chillerState = useMemo(() => {
    if (!chillerSummary) return "pending";
  
    const temp = Number(chillerSummary.latestTemperature);
    const ambient = Number(chillerSummary.latestAmbient);
  
    if (!Number.isFinite(temp)) return "pending";
  
    // main logic based on chiller temp
    if (temp >= 27) return "critical";
    if (temp >= 24) return "warning";
  
    // optional: if ambient is high, slightly degrade state
    if (ambient >= 30) return "warning";
  
    return "good";
  }, [chillerSummary]);

  return (
    <section className="tech-overview-root">
      <div className="tech-overview-toolbar">
        <div>
          <h2>System Diagnostics Overview</h2>
          <p>
            Latest cross-node values and live trends across dispenser, booster,
            and chiller.
          </p>
        </div>

        <div className="tech-overview-refresh">
          <span>Range: Last 24 hours</span>
          <span>
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

      {errorMessage ? (
        <div className="tech-overview-error">{errorMessage}</div>
      ) : null}

      <div className="tech-summary-grid">
        <SummaryCard
          title="Dispenser"
          state={dispenserState}
          onOpen={() => onOpenTab("dispenser")}
          metrics={[
            {
              label: "Count",
              value: String(dispenserDurationSeries.length),
            },
            {
              label: "Water",
              value: formatMetric(dispenserSummary?.waterUsedToday, " oz", 1),
            },
            {
              label: "Syrup",
              value: dispenserSummary?.syrupRemainingEnabled
                ? formatMetric(dispenserSummary?.syrupRemaining, " oz", 1)
                : "No data",
            },
            {
              label: "Avg Press",
              value: formatMetric(dispenserSummary?.avgPressDuration, " ms", 0),
            },
          ]}
        />

        <SummaryCard
          title="Booster"
          state={boosterState}
          onOpen={() => onOpenTab("booster")}
          metrics={[
            {
              label: "Current",
              value: formatMetric(
                Math.abs(Number(boosterSummary?.latestCurrent) || 0),
                " A",
                2
              ),
            },
            {
              label: "Power",
              value: formatMetric(
                Math.abs(Number(boosterSummary?.latestPower) || 0),
                " W",
                1
              ),
            },
            {
              label: "Temp",
              value: formatMetric(boosterSummary?.latestTemperature, " °C", 1),
            },
            {
              label: "Mean Current",
              value: formatMetric(
                Math.abs(Number(boosterSummary?.meanCurrent) || 0),
                " A",
                2
              ),
            },
          ]}
        />

        <SummaryCard
          title="Chiller"
          state={chillerState}
          onOpen={() => onOpenTab("chiller")}
          metrics={[
            {
              label: "Chiller Temp",
              value: formatMetric(chillerSummary?.latestTemperature, " °C", 1),
            },
            {
              label: "Ambient",
              value: formatMetric(chillerSummary?.latestAmbient, " °C", 1),
            },
            {
              label: "Spikes",
              value: String(chillerSpikeCount),
            },
            {
              label: "Mean Temp",
              value: formatMetric(chillerSummary?.meanTemperature, " °C", 1),
            },
          ]}
        />
      </div>

      <div className="tech-small-chart-grid">
        <SmallChartCard
          title="Dispenser Duration Trend"
          subtitle={`${dispenserDurationSeries.length} press events`}
          data={dispenserDurationSeries}
          color="#34d399"
          dataKey="value"
          yLabel="ms"
          type="line"
        />

        <SmallChartCard
          title="Dispenser Water Trend"
          subtitle={`${dispenserWaterSeries.length} water readings`}
          data={dispenserWaterSeries}
          color="#60a5fa"
          dataKey="value"
          yLabel="oz"
          type="area"
        />

        <SmallChartCard
          title="Dispenser Syrup Trend"
          subtitle={`${dispenserSyrupSeries.length} syrup readings`}
          data={dispenserSyrupSeries}
          color="#f59e0b"
          dataKey="value"
          yLabel="oz"
          type="area"
        />

        <SmallChartCard
          title="Booster Current Trend"
          subtitle={`${boosterCurrentSeries.length} current readings`}
          data={boosterCurrentSeries}
          color="#60a5fa"
          dataKey="value"
          yLabel="A"
          type="line"
        />

        <SmallChartCard
          title="Booster Power Trend"
          subtitle={`${boosterPowerSeries.length} power readings`}
          data={boosterPowerSeries}
          color="#ff8a3d"
          dataKey="value"
          yLabel="W"
          type="bar"
        />

        <SmallChartCard
          title="Booster Temperature Trend"
          subtitle={`${boosterTemperatureSeries.length} temperature readings`}
          data={boosterTemperatureSeries}
          color="#34d399"
          dataKey="value"
          yLabel="°C"
          type="area"
        />

        <SmallChartCard
          title="Chiller Temperature Trend"
          subtitle={`${chillerTemperatureSeries.length} chiller readings`}
          data={chillerTemperatureSeries}
          color="#f59e0b"
          dataKey="value"
          yLabel="°C"
          type="area"
        />

        <SmallChartCard
          title="Ambient Temperature Trend"
          subtitle={`${chillerAmbientSeries.length} ambient readings`}
          data={chillerAmbientSeries}
          color="#38bdf8"
          dataKey="value"
          yLabel="°C"
          type="area"
        />
      </div>
    </section>
  );
}

export default TechnicalOverview;