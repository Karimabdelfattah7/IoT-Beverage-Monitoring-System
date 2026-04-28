/**
 * DispenserView Component
 *
 * This component represents the main dashboard view for the Dispenser subsystem.
 * It is responsible for retrieving, processing, and visualizing dispenser telemetry
 * such as syrup usage, water usage, button press duration, dispense count, and
 * syrup remaining.
 *
 * Key Responsibilities:
 * - Fetch data from backend API endpoints (/dispenser/summary and /dispenser/charts)
 * - Process dispenser time-series data and combine related values into chart-ready series
 * - Compute summary statistics such as min, max, mean, median, latest, and count
 * - Display syrup remaining using a tank-style status visualization
 * - Display water usage using a radial progress visualization
 * - Render multiple charts for syrup, water, duration, and usage breakdowns
 * - Support syrup replacement logging through a backend POST request
 * - Support dynamic time range selection and automatic data refresh
 *
 * Technologies Used:
 * - React (hooks: useState, useEffect, useMemo, useCallback)
 * - Recharts (LineChart, AreaChart, BarChart, RadialBarChart)
 * - REST API integration (fetch)
 *
 * This component provides both operational monitoring and technical insight into
 * dispenser behavior, helping users track usage patterns and maintenance needs.
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
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Cell,
} from "recharts";
import "./DispenserView.css";
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

function prepareEventSeries(series = []) {
  return (Array.isArray(series) ? series : []).map((point, index) => ({
    ...point,
    eventIndex: index + 1,
    displayTime: formatExactTime(point.time),
    shortTime: formatShortTime(point.time),
  }));
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

function getSyrupTone(percent) {
  if (percent >= 70) return "good";
  if (percent >= 35) return "warning";
  return "critical";
}

function getSyrupColor(percent) {
  if (percent >= 70) return "#2fd38b";
  if (percent >= 35) return "#ffb43b";
  return "#ff5a6a";
}

/*
  Water usage thresholds made much higher so the ring does not
  go critical too early.
*/
function getWaterTone(usedOz) {
  if (usedOz <= 900) return "good";
  if (usedOz <= 1500) return "warning";
  return "critical";
}

function getWaterRingColor(usedOz) {
  if (usedOz <= 900) return "#2fd38b";
  if (usedOz <= 1500) return "#ffb43b";
  return "#ff5a6a";
}

function getActivityTone(ms) {
  if (ms <= 1500) return "good";
  if (ms <= 3500) return "warning";
  return "critical";
}

function StatPill({ label, value }) {
  return (
    <div className="disp-stat-pill">
      <span className="disp-stat-pill-label">{label}</span>
      <strong className="disp-stat-pill-value">{value}</strong>
    </div>
  );
}

function ChartCard({ title, subtitle, children, stats = [] }) {
  return (
    <div className="disp-chart-card">
      <div className="disp-chart-card-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <div className="disp-chart-subtitle">{subtitle}</div> : null}
        </div>
      </div>

      <div className="disp-chart-card-body">{children}</div>

      {stats.length > 0 && (
        <div className="disp-chart-stats-row">
          {stats.map((stat) => (
            <StatPill key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      )}
    </div>
  );
}

function SyrupStatusCard({
  percent = 0,
  onReplaceSyrup,
  replaceLoading,
  replaceMessage,
  syrupRemaining = 0,
  hasData = false,
}) {
  const tone = hasData ? getSyrupTone(percent) : "warning";
  const color = hasData ? getSyrupColor(percent) : "#5d6b8c";
  const used = Math.max(0, 100 - Number(syrupRemaining || 0));

  return (
    <div className={`disp-syrup-card disp-syrup-${tone}`}>
      <div className="disp-syrup-header">
        <div>
          <span className="disp-syrup-eyebrow">Syrup Remaining</span>
          <h3>Refill Status</h3>
        </div>
      </div>

      <div className="disp-syrup-layout">
        <div className="disp-syrup-tank-shell">
          <div className="disp-syrup-tank">
            <div
              className="disp-syrup-fill"
              style={{
                height: `${hasData ? percent : 0}%`,
                background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`,
              }}
            />
            <div className="disp-syrup-tank-label">
              {hasData ? formatMetric(percent, "%", 2) : "No data"}
            </div>
          </div>
        </div>

        <div className="disp-syrup-meta disp-syrup-meta-wide">
          <span className="disp-syrup-caption">
            {hasData
              ? "Remaining syrup in the current bag."
              : "No syrup reading available for the selected range."}
          </span>

          <div className="disp-syrup-mini-stats">
            <div className="disp-syrup-mini-stat">
              <span>Full</span>
              <strong>100 oz</strong>
            </div>
            <div className="disp-syrup-mini-stat">
              <span>Remaining</span>
              <strong>{hasData ? formatMetric(syrupRemaining, " oz", 2) : "--"}</strong>
            </div>
            <div className="disp-syrup-mini-stat">
              <span>Used</span>
              <strong>{hasData ? formatMetric(used, " oz", 2) : "--"}</strong>
            </div>
          </div>

          <div className="disp-syrup-inline-actions">
            <span className={`disp-syrup-status-text disp-syrup-status-${tone}`}>
              {!hasData && "No reading"}
              {hasData && tone === "good" && "Healthy level"}
              {hasData && tone === "warning" && "Refill soon"}
              {hasData && tone === "critical" && "Low bag level"}
            </span>

            <button
              className="disp-maintenance-btn"
              onClick={onReplaceSyrup}
              disabled={replaceLoading}
            >
              {replaceLoading ? "Logging..." : "Replace Syrup Bag"}
            </button>
          </div>

          {replaceMessage ? (
            <div className="disp-action-message">{replaceMessage}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WaterRingCard({ usedOz = 0 }) {
  /*
    Scale the ring to a much higher maximum so it stays calmer.
    You can tune 1800 upward/downward later if needed.
  */
  const clampedPercent = Math.max(0, Math.min(100, (Number(usedOz) / 1800) * 100));
  const tone = getWaterTone(usedOz);
  const ringColor = getWaterRingColor(usedOz);

  const ringData = [{ name: "used", value: clampedPercent }];

  return (
    <div className={`disp-summary-card disp-water-ring-card disp-summary-${tone}`}>
      <div className="disp-water-ring-header">
        <span className="disp-summary-label">Water Used</span>
      </div>

      <div className="disp-water-ring-visual disp-water-ring-visual-large">
        <ResponsiveContainer width="100%" height={190}>
          <RadialBarChart
            cx="50%"
            cy="54%"
            innerRadius="62%"
            outerRadius="98%"
            barSize={20}
            data={ringData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: "rgba(255,255,255,0.08)" }}
              dataKey="value"
              cornerRadius={30}
            >
              <Cell fill={ringColor} />
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>

        <div className="disp-water-ring-center">
          <div className="disp-water-ring-value">{formatMetric(usedOz, " oz", 1)}</div>
          <div className="disp-water-ring-subtitle">Selected range</div>
        </div>
      </div>

      <div className="disp-water-ring-footer">
        <span className={`disp-water-ring-status disp-water-ring-status-${tone}`}>
          {tone === "good" && "Normal usage"}
          {tone === "warning" && "Moderate usage"}
          {tone === "critical" && "High usage"}
        </span>
      </div>
    </div>
  );
}

function ActivityRow({ label, value, percent, tone }) {
  return (
    <div className="disp-activity-row">
      <div className="disp-activity-row-top">
        <span className="disp-activity-title">{label}</span>
        <strong className="disp-activity-value">{value}</strong>
      </div>

      <div className="disp-activity-progress">
        <div
          className={`disp-activity-progress-fill disp-activity-progress-fill-${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ActivityCard({ count = 0, ms = 0 }) {
  const tone = getActivityTone(ms);
  const countPercent = Math.max(8, Math.min(100, (Number(count) / 40) * 100));
  const durationPercent = Math.max(8, Math.min(100, (Number(ms) / 5000) * 100));

  return (
    <div className={`disp-summary-card disp-summary-${tone}`}>
      <div className="disp-activity-stack">
        <ActivityRow
          label="Dispense Count"
          value={formatMetric(count, "", 0)}
          percent={countPercent}
          tone={tone}
        />

        <ActivityRow
          label="Avg Press Duration"
          value={formatMetric(ms, " ms", 0)}
          percent={durationPercent}
          tone={tone}
        />
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0]?.payload;

  return (
    <div className="disp-tooltip">
      <div className="disp-tooltip-time">{point?.displayTime || "--"}</div>
      <div className="disp-tooltip-row">
        <span style={{ color: payload[0].color }}>{payload[0].name}</span>
        <strong>{payload[0].value}</strong>
      </div>
      <div className="disp-tooltip-row">
        <span>Event</span>
        <strong>#{point?.eventIndex}</strong>
      </div>
    </div>
  );
}

function DispenserView({ mode = "full", device = "SX1262" }) {
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceMessage, setReplaceMessage] = useState("");
  const [range, setRange] = useState("24h");
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, chartsRes] = await Promise.all([
        fetch(`${API_BASE}/dispenser/summary?range=${range}`),
        fetch(`${API_BASE}/dispenser/charts?range=${range}`),
      ]);

      const summaryJson = await summaryRes.json();
      const chartsJson = await chartsRes.json();

      if (!summaryRes.ok) {
        throw new Error(summaryJson.error || summaryJson.details || "Failed to load summary");
      }

      if (!chartsRes.ok) {
        throw new Error(chartsJson.error || chartsJson.details || "Failed to load charts");
      }

      setSummary(summaryJson);
      setCharts(chartsJson);
      setErrorMessage("");
      setLastRefresh(new Date());
    } catch (error) {
      console.error("DispenserView load error:", error);
      setErrorMessage(error.message || "Failed to load dispenser telemetry.");
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

  const syrupSeries = useMemo(() => prepareEventSeries(charts?.syrupSeries), [charts]);
  const waterSeries = useMemo(() => prepareEventSeries(charts?.waterSeries), [charts]);
  const durationSeries = useMemo(() => prepareEventSeries(charts?.durationSeries), [charts]);

  const unifiedSeries = useMemo(() => {
    if (!durationSeries.length) return [];

    return durationSeries.map((durationPoint, index) => ({
      ...durationPoint,
      syrup: syrupSeries[index]?.value ?? null,
      water: waterSeries[index]?.value ?? null,
      duration: durationPoint.value,
    }));
  }, [durationSeries, syrupSeries, waterSeries]);

  const waterBreakdownSeries = useMemo(() => unifiedSeries, [unifiedSeries]);

  const derivedDispenseCount = useMemo(() => unifiedSeries.length, [unifiedSeries]);

  const latestWaterPoint = useMemo(() => {
    if (!waterSeries.length) return null;
    return waterSeries[waterSeries.length - 1];
  }, [waterSeries]);

  const latestDurationPoint = useMemo(() => {
    if (!durationSeries.length) return null;
    return durationSeries[durationSeries.length - 1];
  }, [durationSeries]);

  const hasRealSyrupData = useMemo(() => {
    return Boolean(summary?.syrupRemainingEnabled) && Number(summary?.syrupRemaining) > 0;
  }, [summary]);

  const displayedSyrupPercent = useMemo(() => {
    if (!hasRealSyrupData) return 0;
    return Math.max(0, Math.min(100, Number(summary.syrupRemaining)));
  }, [hasRealSyrupData, summary]);

  const syrupStats = useMemo(() => {
    const normalized = unifiedSeries
      .map((item) => ({ value: item.syrup }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [unifiedSeries]);

  const waterStats = useMemo(() => {
    const normalized = unifiedSeries
      .map((item) => ({ value: item.water }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [unifiedSeries]);

  const durationStats = useMemo(() => {
    const normalized = unifiedSeries
      .map((item) => ({ value: item.duration }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [unifiedSeries]);

  const waterBreakdownStats = useMemo(() => {
    const normalized = waterBreakdownSeries
      .map((item) => ({ value: item.water }))
      .filter((item) => Number.isFinite(Number(item.value)));
    return computeSeriesStats(normalized);
  }, [waterBreakdownSeries]);

  const handleReplaceSyrup = async () => {
    try {
      setReplaceLoading(true);
      setReplaceMessage("");

      const response = await fetch(`${API_BASE}/dispenser/replace-syrup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device,
          notes: "Syrup bag replaced from React dispenser dashboard",
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to log syrup replacement");
      }

      setReplaceMessage(json.message || "Syrup replacement logged.");
      await fetchAll();
    } catch (error) {
      setReplaceMessage(error.message);
    } finally {
      setReplaceLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="disp-root">
        <div className="disp-loading-card">Loading dispenser telemetry...</div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="disp-root">
        <div className="disp-loading-card">
          <strong>Could not load dispenser telemetry.</strong>
          <div style={{ marginTop: 10 }}>{errorMessage}</div>
          <div style={{ marginTop: 10, opacity: 0.8 }}>API base: {API_BASE}</div>
        </div>
      </section>
    );
  }

  if (!summary || !charts) {
    return (
      <section className="disp-root">
        <div className="disp-loading-card">No dispenser data available.</div>
      </section>
    );
  }

  return (
    <section className="disp-root">
      <div className="disp-toolbar">
        <div className="disp-range-note">
          Showing dispenser telemetry for: <strong>{summary.rangeLabel || range}</strong>
          <span className="disp-auto-refresh-note">
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

        <div className="disp-range-select-wrap">
          <label className="disp-range-label" htmlFor="disp-range-select">
            Time Range
          </label>
          <select
            id="disp-range-select"
            className="disp-range-select"
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

      <div className="disp-summary-grid">
        <SyrupStatusCard
          percent={displayedSyrupPercent}
          onReplaceSyrup={handleReplaceSyrup}
          replaceLoading={replaceLoading}
          replaceMessage={replaceMessage}
          syrupRemaining={summary.syrupRemaining}
          hasData={hasRealSyrupData}
        />

        <WaterRingCard usedOz={summary.waterUsedToday} />

        <ActivityCard
          count={derivedDispenseCount}
          ms={summary.avgPressDuration}
        />
      </div>

      <div className="disp-chart-grid">
        <ChartCard
          title="Syrup Over Time"
          subtitle={`${unifiedSeries.length} raw dispenser events`}
          stats={[
            { label: "Min", value: formatMetric(syrupStats.min, " oz", 1) },
            { label: "Mean", value: formatMetric(syrupStats.mean, " oz", 1) },
            { label: "Median", value: formatMetric(syrupStats.median, " oz", 1) },
            { label: "Max", value: formatMetric(syrupStats.max, " oz", 1) },
            { label: "Latest", value: formatMetric(syrupStats.latest, " oz", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={unifiedSeries} margin={{ top: 10, right: 18, left: 18, bottom: 26 }}>
              <defs>
                <linearGradient id="syrupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffb43b" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#ffb43b" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => unifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded button press time",
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
                  value: "Ounces (oz)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#9fb0cb", fontSize: 12, textAnchor: "middle" },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="linear"
                dataKey="syrup"
                name="Syrup"
                stroke="#ffb43b"
                fill="url(#syrupGradient)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#ffb43b", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Water Over Time"
          subtitle={`${unifiedSeries.length} raw dispenser events`}
          stats={[
            { label: "Min", value: formatMetric(waterStats.min, " oz", 1) },
            { label: "Mean", value: formatMetric(waterStats.mean, " oz", 1) },
            { label: "Median", value: formatMetric(waterStats.median, " oz", 1) },
            { label: "Max", value: formatMetric(waterStats.max, " oz", 1) },
            { label: "Latest", value: formatMetric(waterStats.latest, " oz", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={unifiedSeries} margin={{ top: 10, right: 18, left: 18, bottom: 26 }}>
              <defs>
                <linearGradient id="waterGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => unifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded button press time",
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
                  value: "Ounces (oz)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#9fb0cb", fontSize: 12, textAnchor: "middle" },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="linear"
                dataKey="water"
                name="Water"
                stroke="#60a5fa"
                fill="url(#waterGradient)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#60a5fa", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Button Press Duration"
          subtitle={`${unifiedSeries.length} raw button press events`}
          stats={[
            { label: "Min", value: formatMetric(durationStats.min, " ms", 0) },
            { label: "Mean", value: formatMetric(durationStats.mean, " ms", 0) },
            { label: "Median", value: formatMetric(durationStats.median, " ms", 0) },
            { label: "Max", value: formatMetric(durationStats.max, " ms", 0) },
            { label: "Latest", value: formatMetric(durationStats.latest, " ms", 0) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={unifiedSeries} margin={{ top: 10, right: 18, left: 24, bottom: 26 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => unifiedSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded button press time",
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
                width={64}
                label={{
                  value: "Duration (ms)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#9fb0cb", fontSize: 12, textAnchor: "middle" },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="linear"
                dataKey="duration"
                name="Duration"
                stroke="#34d399"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#34d399", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Water Usage Breakdown"
          subtitle={`${waterBreakdownSeries.length} raw water entries`}
          stats={[
            { label: "Min", value: formatMetric(waterBreakdownStats.min, " oz", 1) },
            { label: "Mean", value: formatMetric(waterBreakdownStats.mean, " oz", 1) },
            { label: "Median", value: formatMetric(waterBreakdownStats.median, " oz", 1) },
            { label: "Max", value: formatMetric(waterBreakdownStats.max, " oz", 1) },
            { label: "Latest", value: formatMetric(waterBreakdownStats.latest, " oz", 1) },
          ]}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={waterBreakdownSeries} margin={{ top: 10, right: 18, left: 18, bottom: 26 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                type="number"
                dataKey="eventIndex"
                domain={["dataMin", "dataMax"]}
                allowDecimals={false}
                tickFormatter={(value) => waterBreakdownSeries[value - 1]?.shortTime || value}
                label={{
                  value: "Recorded entry time",
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
                  value: "Ounces (oz)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#9fb0cb", fontSize: 12, textAnchor: "middle" },
                }}
                tick={{ fill: "#9fb0cb", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="water"
                name="Water"
                fill="#4fd1c5"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {mode === "full" && (
        <div className="disp-actions-layout">
          <div className="disp-actions-card disp-actions-card-compact">
            <span className="panel-eyebrow">Current Snapshot</span>
            <h3>Last Readings</h3>

            <div className="disp-snapshot-list">
              <div className="disp-snapshot-row">
                <span>Latest Water Point</span>
                <strong>{latestWaterPoint ? `${latestWaterPoint.value} oz` : "--"}</strong>
              </div>
              <div className="disp-snapshot-row">
                <span>Latest Duration Point</span>
                <strong>{latestDurationPoint ? `${latestDurationPoint.value} ms` : "--"}</strong>
              </div>
              <div className="disp-snapshot-row">
                <span>Latest Total</span>
                <strong>{formatMetric(summary.latestTotal, " oz", 1)}</strong>
              </div>
              <div className="disp-snapshot-row">
                <span>Latest Syrup Value</span>
                <strong>{formatMetric(summary.latestSyrup, " oz", 1)}</strong>
              </div>
              <div className="disp-snapshot-row">
                <span>Syrup Remaining</span>
                <strong>
                  {hasRealSyrupData ? formatMetric(summary.syrupRemaining, " oz", 2) : "--"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default DispenserView;