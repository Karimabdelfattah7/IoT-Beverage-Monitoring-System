/**
 * ManagerView Component
 *
 * This component represents the main manager-level dashboard for the system.
 * It provides a high-level operational summary of all monitored subsystems:
 * Chiller, Dispenser, and Booster Pump.
 *
 * Key Responsibilities:
 * - Fetch summary and chart data for all subsystems from the backend API
 * - Evaluate subsystem health using threshold-based status logic
 * - Display overall system health, active alerts, and priority levels
 * - Provide quick navigation to detailed technical node views
 * - Allow dispenser syrup bag replacement logging
 * - Generate a downloadable PDF report using current subsystem summaries
 * - Auto-refresh system data every 5 seconds
 *
 * Technologies Used:
 * - React (hooks: useState, useEffect, useMemo, useCallback)
 * - React Router (useNavigate)
 * - jsPDF (report generation)
 * - REST API integration (fetch)
 *
 * This view is designed for non-technical or managerial users who need a clear,
 * quick understanding of system status without analyzing detailed charts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import "./ManagerView.css";
import multiplexLogo from "../assets/multiplex_logo.png";
import chillerImage from "../assets/chiller.png";
import dispenserImage from "../assets/dispenser.png";
import boosterImage from "../assets/booster.png";
import API_BASE from "../config";

const REFRESH_INTERVAL_MS = 5000;
const MANAGER_RANGE = "30d";

function formatTime(date) {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMetric(value, suffix = "", digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num.toFixed(digits)}${suffix}`;
}

function getDispenserStatus(summary, charts) {
  const durationSeries = Array.isArray(charts?.durationSeries)
    ? charts.durationSeries
    : [];
  const derivedDispenseCount = durationSeries.length;

  if (!summary && derivedDispenseCount === 0) {
    return {
      state: "pending",
      label: "Awaiting Data",
      priority: "Medium",
      summary: "Live dispenser telemetry is not available yet.",
      metrics: [
        { label: "Dispense Count", value: "No data" },
        { label: "Syrup Level", value: "No data" },
      ],
      issue: null,
    };
  }

  if (!summary?.syrupRemainingEnabled) {
    return {
      state: "pending",
      label: "Partial Data",
      priority: "Medium",
      summary: "Dispenser data is limited because syrup level is not available.",
      metrics: [
        { label: "Dispense Count", value: String(derivedDispenseCount) },
        { label: "Syrup Level", value: "No data" },
      ],
      issue: null,
    };
  }

  if (Number(summary.syrupRemaining) <= 30) {
    return {
      state: "warning",
      label: "Attention Needed",
      priority: "Medium",
      summary: "Syrup level is low and should be reviewed soon.",
      metrics: [
        { label: "Dispense Count", value: String(derivedDispenseCount) },
        {
          label: "Syrup Level",
          value: formatMetric(summary.syrupRemaining, " oz", 2),
        },
      ],
      issue: "Low syrup bag level detected.",
    };
  }

  if (Number(summary.avgPressDuration) > 3500) {
    return {
      state: "warning",
      label: "Attention Needed",
      priority: "Medium",
      summary: "Dispense timing is slower than expected.",
      metrics: [
        { label: "Dispense Count", value: String(derivedDispenseCount) },
        {
          label: "Syrup Level",
          value: formatMetric(summary.syrupRemaining, " oz", 2),
        },
      ],
      issue: "Dispenser performance below target range.",
    };
  }

  return {
    state: "good",
    label: "Operational",
    priority: "Low",
    summary: "Dispensing subsystem is operating within expected range.",
    metrics: [
      { label: "Dispense Count", value: String(derivedDispenseCount) },
      {
        label: "Syrup Level",
        value: formatMetric(summary.syrupRemaining, " oz", 2),
      },
    ],
    issue: null,
  };
}

function getBoosterStatus(summary, charts) {
  const currentSeries = Array.isArray(charts?.currentSeries)
    ? charts.currentSeries
    : [];

  if (!summary && currentSeries.length === 0) {
    return {
      state: "pending",
      label: "Awaiting Data",
      priority: "Medium",
      summary: "Live booster telemetry is not available yet.",
      metrics: [
        { label: "Motor Current", value: "No data" },
        { label: "Temperature", value: "No data" },
      ],
      issue: null,
    };
  }

  if (summary?.systemStatus === "High electrical load") {
    return {
      state: "warning",
      label: "Attention Needed",
      priority: "Medium",
      summary: "Motor load is elevated and should be reviewed.",
      metrics: [
        {
          label: "Motor Current",
          value: formatMetric(summary.latestCurrent, " A", 2),
        },
        {
          label: "Temperature",
          value: formatMetric(summary.latestTemperature, " °C", 1),
        },
      ],
      issue: "High booster electrical load detected.",
    };
  }

  if (summary?.systemStatus === "Temperature elevated") {
    return {
      state: "warning",
      label: "Attention Needed",
      priority: "Medium",
      summary: "Motor temperature is above the preferred range.",
      metrics: [
        {
          label: "Motor Current",
          value: formatMetric(summary.latestCurrent, " A", 2),
        },
        {
          label: "Temperature",
          value: formatMetric(summary.latestTemperature, " °C", 1),
        },
      ],
      issue: "Booster temperature elevated.",
    };
  }

  return {
    state: "good",
    label: "Operational",
    priority: "Low",
    summary: "Booster subsystem is operating within expected range.",
    metrics: [
      {
        label: "Motor Current",
        value: formatMetric(summary?.latestCurrent, " A", 2),
      },
      {
        label: "Temperature",
        value: formatMetric(summary?.latestTemperature, " °C", 1),
      },
    ],
    issue: null,
  };
}

function getChillerStatus(summary, charts) {
  const tempSeries = Array.isArray(charts?.temperatureSeries)
    ? charts.temperatureSeries
    : [];

  if (!summary && tempSeries.length === 0) {
    return {
      state: "pending",
      label: "Awaiting Data",
      priority: "Medium",
      summary: "Live chiller telemetry is not available yet.",
      metrics: [
        { label: "Chiller Temp", value: "No data" },
        { label: "Ambient", value: "No data" },
      ],
      issue: null,
    };
  }

  const latestTemperature = Number(summary?.latestTemperature);
  const latestAmbient = Number(summary?.latestAmbient);

  if (!Number.isFinite(latestTemperature)) {
    return {
      state: "pending",
      label: "Awaiting Data",
      priority: "Medium",
      summary: "Chiller temperature data is not available yet.",
      metrics: [
        { label: "Chiller Temp", value: "No data" },
        {
          label: "Ambient",
          value: Number.isFinite(latestAmbient)
            ? formatMetric(latestAmbient, " °C", 1)
            : "No data",
        },
      ],
      issue: null,
    };
  }

  if (latestTemperature >= 27) {
    return {
      state: "critical",
      label: "Critical",
      priority: "High",
      summary: "Chiller temperature is above the critical threshold.",
      metrics: [
        {
          label: "Chiller Temp",
          value: formatMetric(latestTemperature, " °C", 1),
        },
        {
          label: "Ambient",
          value: Number.isFinite(latestAmbient)
            ? formatMetric(latestAmbient, " °C", 1)
            : "No data",
        },
      ],
      issue: "Chiller temperature is critically high.",
    };
  }

  if (latestTemperature >= 24) {
    return {
      state: "warning",
      label: "Attention Needed",
      priority: "Medium",
      summary: "Chiller temperature is elevated and should be reviewed.",
      metrics: [
        {
          label: "Chiller Temp",
          value: formatMetric(latestTemperature, " °C", 1),
        },
        {
          label: "Ambient",
          value: Number.isFinite(latestAmbient)
            ? formatMetric(latestAmbient, " °C", 1)
            : "No data",
        },
      ],
      issue: "Chiller temperature is above the preferred range.",
    };
  }

  return {
    state: "good",
    label: "Operational",
    priority: "Low",
    summary: "Cooling subsystem is operating within expected range.",
    metrics: [
      {
        label: "Chiller Temp",
        value: formatMetric(latestTemperature, " °C", 1),
      },
      {
        label: "Ambient",
        value: Number.isFinite(latestAmbient)
          ? formatMetric(latestAmbient, " °C", 1)
          : "No data",
      },
    ],
    issue: null,
  };
}

function getHealthScoreForState(state) {
  if (state === "good") return 100;
  if (state === "warning") return 78;
  if (state === "critical") return 45;
  if (state === "pending") return 70;
  return 70;
}

function ManagerSystemCard({
  eyebrow,
  title,
  image,
  state,
  label,
  priority,
  summary,
  metrics,
  openLabel,
  onOpen,
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionDisabled,
}) {
  return (
    <div className="system-card system-card-with-corner-image manager-system-card">
      <div className="manager-image-glow" />
      <div className="corner-image-wrap manager-corner-image-wrap">
        <img
          src={image}
          alt={title}
          className="corner-system-image manager-corner-system-image"
        />
      </div>

      <div className="system-card-header">
        <div>
          <span className="system-small-label">{eyebrow}</span>
          <h3 className="system-title">{title}</h3>
        </div>

        <span className={`status-pill status-${state}`}>{label}</span>
      </div>

      <p className="system-summary">{summary}</p>

      <div className="manager-metric-row">
        {metrics.map((metric) => (
          <div key={metric.label} className="manager-metric-chip">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="system-footer manager-system-footer">
        <div className="priority-block">
          <span className="priority-label">Priority</span>
          <span className="priority-value">{priority}</span>
        </div>

        <div className="system-actions manager-system-actions">
          {secondaryActionLabel ? (
            <button
              className="manager-secondary-btn"
              onClick={onSecondaryAction}
              disabled={secondaryActionDisabled}
            >
              {secondaryActionLabel}
            </button>
          ) : null}

          <button className="ghost-action-btn" onClick={onOpen}>
            {openLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagerView() {
  const navigate = useNavigate();

  const [dispenserSummary, setDispenserSummary] = useState(null);
  const [dispenserCharts, setDispenserCharts] = useState(null);
  const [boosterSummary, setBoosterSummary] = useState(null);
  const [boosterCharts, setBoosterCharts] = useState(null);
  const [chillerSummary, setChillerSummary] = useState(null);
  const [chillerCharts, setChillerCharts] = useState(null);
  const [lastSync, setLastSync] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceMessage, setReplaceMessage] = useState("");

  const fetchManagerData = useCallback(async () => {
    try {
      const [
        dispenserSummaryRes,
        dispenserChartsRes,
        boosterSummaryRes,
        boosterChartsRes,
        chillerSummaryRes,
        chillerChartsRes,
      ] = await Promise.allSettled([
        fetch(`${API_BASE}/dispenser/summary?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Dispenser summary failed"
              );
            }
            return json;
          }
        ),
        fetch(`${API_BASE}/dispenser/charts?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Dispenser charts failed"
              );
            }
            return json;
          }
        ),
        fetch(`${API_BASE}/booster/summary?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Booster summary failed"
              );
            }
            return json;
          }
        ),
        fetch(`${API_BASE}/booster/charts?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Booster charts failed"
              );
            }
            return json;
          }
        ),
        fetch(`${API_BASE}/chiller/summary?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Chiller summary failed"
              );
            }
            return json;
          }
        ),
        fetch(`${API_BASE}/chiller/charts?range=${MANAGER_RANGE}`).then(
          async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(
                json.error || json.details || "Chiller charts failed"
              );
            }
            return json;
          }
        ),
      ]);

      setDispenserSummary(
        dispenserSummaryRes.status === "fulfilled"
          ? dispenserSummaryRes.value
          : null
      );
      setDispenserCharts(
        dispenserChartsRes.status === "fulfilled"
          ? dispenserChartsRes.value
          : null
      );
      setBoosterSummary(
        boosterSummaryRes.status === "fulfilled" ? boosterSummaryRes.value : null
      );
      setBoosterCharts(
        boosterChartsRes.status === "fulfilled" ? boosterChartsRes.value : null
      );
      setChillerSummary(
        chillerSummaryRes.status === "fulfilled" ? chillerSummaryRes.value : null
      );
      setChillerCharts(
        chillerChartsRes.status === "fulfilled" ? chillerChartsRes.value : null
      );

      setLastSync(new Date());
    } catch (error) {
      console.error("Manager view refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagerData();

    const intervalId = setInterval(() => {
      fetchManagerData();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fetchManagerData]);

  const openTechnicalView = () => {
    navigate("/technician?tab=overview");
  };

  const handleReplaceBag = async () => {
    try {
      setReplaceLoading(true);
      setReplaceMessage("");

      const response = await fetch(`${API_BASE}/dispenser/replace-syrup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device: "SX1262",
          notes: "Syrup bag replaced from manager dashboard",
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || json.details || "Failed to replace syrup bag"
        );
      }

      setReplaceMessage(json.message || "Replacement logged.");
      await fetchManagerData();
    } catch (error) {
      setReplaceMessage(error.message);
    } finally {
      setReplaceLoading(false);
    }
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF();

    const chiller = getChillerStatus(chillerSummary, chillerCharts);
    const dispenser = getDispenserStatus(dispenserSummary, dispenserCharts);
    const booster = getBoosterStatus(boosterSummary, boosterCharts);

    const systems = [
      { title: "Chiller", ...chiller },
      { title: "Dispenser", ...dispenser },
      { title: "Booster Pump", ...booster },
    ];

    const healthyCount = systems.filter((item) => item.state === "good").length;
    const warningCount = systems.filter((item) => item.state === "warning").length;
    const criticalCount = systems.filter(
      (item) => item.state === "critical"
    ).length;
    const healthPercent = Math.round(
      systems.reduce(
        (sum, item) => sum + getHealthScoreForState(item.state),
        0
      ) / systems.length
    );

    let y = 20;

    doc.setFontSize(18);
    doc.text("Multiplex Beverage Systems", 14, y);
    y += 10;

    doc.setFontSize(14);
    doc.text("Manager Report", 14, y);
    y += 10;

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
    y += 8;
    doc.text(`Last Sync: ${formatTime(lastSync)}`, 14, y);
    y += 12;

    doc.setFontSize(12);
    doc.text(`System Health: ${healthPercent}%`, 14, y);
    y += 7;
    doc.text(`Subsystems Healthy: ${healthyCount}/${systems.length}`, 14, y);
    y += 7;
    doc.text(`Open Alerts: ${warningCount}`, 14, y);
    y += 7;
    doc.text(`Critical Issues: ${criticalCount}`, 14, y);
    y += 12;

    systems.forEach((system) => {
      doc.setFontSize(13);
      doc.text(`${system.title} — ${system.label}`, 14, y);
      y += 7;

      doc.setFontSize(10);
      doc.text(system.summary, 14, y);
      y += 7;

      system.metrics.forEach((metric) => {
        doc.text(`${metric.label}: ${metric.value}`, 18, y);
        y += 6;
      });

      y += 6;

      if (y > 260) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save("multiplex-system-report.pdf");
  };

  const chillerStatus = useMemo(
    () => getChillerStatus(chillerSummary, chillerCharts),
    [chillerSummary, chillerCharts]
  );
  const dispenserStatus = useMemo(
    () => getDispenserStatus(dispenserSummary, dispenserCharts),
    [dispenserSummary, dispenserCharts]
  );
  const boosterStatus = useMemo(
    () => getBoosterStatus(boosterSummary, boosterCharts),
    [boosterSummary, boosterCharts]
  );

  const systems = useMemo(
    () => [
      {
        id: "chiller",
        eyebrow: "Cooling",
        title: "Chiller",
        image: chillerImage,
        openLabel: "Open Chiller Technical View",
        ...chillerStatus,
      },
      {
        id: "dispenser",
        eyebrow: "Dispensing",
        title: "Dispenser",
        image: dispenserImage,
        openLabel: "Open Dispenser Technical View",
        ...dispenserStatus,
      },
      {
        id: "booster",
        eyebrow: "Pumping Motor",
        title: "Booster Pump",
        image: boosterImage,
        openLabel: "Open Booster Technical View",
        ...boosterStatus,
      },
    ],
    [chillerStatus, dispenserStatus, boosterStatus]
  );

  const healthyCount = systems.filter((item) => item.state === "good").length;
  const warningCount = systems.filter((item) => item.state === "warning").length;
  const criticalCount = systems.filter(
    (item) => item.state === "critical"
  ).length;

  const healthPercent = useMemo(() => {
    const total =
      systems.reduce(
        (sum, system) => sum + getHealthScoreForState(system.state),
        0
      ) / systems.length;
    return Math.round(total);
  }, [systems]);

  const activeAlerts = useMemo(() => {
    return systems
      .filter((system) => system.issue)
      .map((system) => ({
        id: system.id,
        title: system.issue,
        subtitle: system.summary,
        priority: system.priority,
      }));
  }, [systems]);

  const ringDegrees = Math.max(0, Math.min(360, healthPercent * 3.6));
  const ringBackground =
    ringDegrees >= 360
      ? "radial-gradient(circle at center, #0c1727 57%, transparent 58%), conic-gradient(var(--success) 0deg 360deg)"
      : `radial-gradient(circle at center, #0c1727 57%, transparent 58%), conic-gradient(var(--success) 0deg ${ringDegrees}deg, rgba(255, 255, 255, 0.08) ${ringDegrees}deg 360deg)`;

  const openTechnician = (tab) => {
    navigate(`/technician?tab=${tab}`);
  };

  return (
    <div className="page-shell">
      <div className="dashboard-container">
        <header className="header-shell manager-header-shell">
          <div className="main-header manager-main-header">
            <div className="brand-row manager-brand-row">
              <img
                src={multiplexLogo}
                alt="Multiplex logo"
                className="multiplex-logo manager-multiplex-logo"
              />
              <div className="manager-brand-copy">
                <h1 className="brand-title manager-brand-title">
                  Beverage Systems
                </h1>
              </div>
            </div>

            <div className="header-actions">
              <div className="sync-box">
                <span className="sync-label">Last Synced</span>
                <span className="sync-value">{formatTime(lastSync)}</span>
              </div>
            </div>
          </div>
        </header>

        <section className="hero-panel manager-hero-panel">
          <div className="hero-left">
            <span className="hero-eyebrow">Live Operations Summary</span>
            <h2 className="hero-title">System Health</h2>
            <p className="hero-description manager-hero-description">
              This dashboard summarizes the live performance of the beverage
              machine and provides a clear view of subsystem condition, recent
              activity, and potential technical issues.
            </p>

            <div className="hero-badges">
              <span className="info-badge">Refresh: Every 5 sec</span>
            </div>

            <div className="manager-hero-actions">
              <button
                className="manager-hero-primary-btn"
                onClick={openTechnicalView}
              >
                Open Technical View
              </button>
            </div>
          </div>

          <div className="hero-right">
            <div className="health-ring" style={{ background: ringBackground }}>
              <div className="health-ring-inner">
                <div className="health-value">{healthPercent}%</div>
                <div className="health-label">
                  {warningCount > 0 || criticalCount > 0
                    ? "Needs Review"
                    : "Stable"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="kpi-grid manager-kpi-grid">
          <div className="kpi-card kpi-good">
            <span className="kpi-label">Subsystems Healthy</span>
            <span className="kpi-value">
              {healthyCount}/{systems.length}
            </span>
          </div>

          <div className="kpi-card kpi-warning">
            <span className="kpi-label">Open Alerts</span>
            <span className="kpi-value">{activeAlerts.length}</span>
          </div>

          <div className="kpi-card kpi-neutral">
            <span className="kpi-label">Critical Issues</span>
            <span className="kpi-value">{criticalCount}</span>
          </div>
        </section>

        <section className="systems-grid manager-systems-grid">
          <ManagerSystemCard
            eyebrow={systems[0].eyebrow}
            title={systems[0].title}
            image={systems[0].image}
            state={systems[0].state}
            label={systems[0].label}
            priority={systems[0].priority}
            summary={systems[0].summary}
            metrics={systems[0].metrics}
            openLabel={systems[0].openLabel}
            onOpen={() => openTechnician("chiller")}
          />

          <ManagerSystemCard
            eyebrow={systems[1].eyebrow}
            title={systems[1].title}
            image={systems[1].image}
            state={systems[1].state}
            label={systems[1].label}
            priority={systems[1].priority}
            summary={systems[1].summary}
            metrics={systems[1].metrics}
            openLabel={systems[1].openLabel}
            onOpen={() => openTechnician("dispenser")}
            onSecondaryAction={handleReplaceBag}
            secondaryActionLabel={replaceLoading ? "Logging..." : "Replace Bag"}
            secondaryActionDisabled={replaceLoading}
          />

          <ManagerSystemCard
            eyebrow={systems[2].eyebrow}
            title={systems[2].title}
            image={systems[2].image}
            state={systems[2].state}
            label={systems[2].label}
            priority={systems[2].priority}
            summary={systems[2].summary}
            metrics={systems[2].metrics}
            openLabel={systems[2].openLabel}
            onOpen={() => openTechnician("booster")}
          />
        </section>

        {replaceMessage ? (
          <div className="manager-replace-message">{replaceMessage}</div>
        ) : null}

        <section className="bottom-grid">
          <div className="panel-card">
            <div className="panel-header">
              <div className="alert-title-row">
                <div
                  className={`warning-icon-wrap ${
                    activeAlerts.length === 0 ? "warning-icon-wrap-good" : ""
                  }`}
                >
                  <span
                    className={`warning-icon ${
                      activeAlerts.length === 0 ? "warning-icon-good" : ""
                    }`}
                  >
                    {activeAlerts.length === 0 ? "✓" : "⚠"}
                  </span>
                </div>
                <div>
                  <span className="panel-eyebrow">Incident Summary</span>
                  <h3 className="panel-title">Active Operational Alerts</h3>
                </div>
              </div>
            </div>

            <div className="alert-list">
              {loading ? (
                <div className="alert-item">
                  <div className="alert-item-left">
                    <div>
                      <h4 className="alert-title">
                        Loading subsystem summaries...
                      </h4>
                      <p className="alert-subtitle">
                        The manager dashboard is collecting current subsystem
                        health.
                      </p>
                    </div>
                  </div>
                </div>
              ) : activeAlerts.length > 0 ? (
                activeAlerts.map((alert) => (
                  <div key={alert.id} className="alert-item">
                    <div className="alert-item-left">
                      <div>
                        <h4 className="alert-title">{alert.title}</h4>
                        <p className="alert-subtitle">{alert.subtitle}</p>
                      </div>
                    </div>

                    <div className="alert-item-right">
                      <span className="severity-pill">{alert.priority}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="alert-item">
                  <div className="alert-item-left">
                    <div>
                      <h4 className="alert-title">No active alerts</h4>
                      <p className="alert-subtitle">
                        No current warning or critical conditions were found in
                        the live subsystem summaries.
                      </p>
                    </div>
                  </div>

                  <div className="alert-item-right">
                    <span className="severity-pill severity-pill-good">
                      Good
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">Recommended Actions</span>
                <h3 className="panel-title">Operations Controls</h3>
              </div>
            </div>

            <div className="action-grid">
              <button
                className="action-card primary-action-card"
                onClick={openTechnicalView}
              >
                <span className="action-card-label">Open Technical View</span>
                <span className="action-card-subtitle">
                  Open the technical overview and node-level diagnostics.
                </span>
              </button>

              <button
                className="action-card"
                onClick={() => openTechnician("dispenser")}
              >
                <span className="action-card-label">Review Dispenser</span>
                <span className="action-card-subtitle">
                  Inspect syrup level, water use, and dispense timing trends.
                </span>
              </button>

              <button
                className="action-card"
                onClick={() => openTechnician("booster")}
              >
                <span className="action-card-label">Review Booster</span>
                <span className="action-card-subtitle">
                  Inspect motor current, power, and booster temperature behavior.
                </span>
              </button>

              <button
                className="action-card"
                onClick={() => openTechnician("chiller")}
              >
                <span className="action-card-label">Review Chiller</span>
                <span className="action-card-subtitle">
                  Inspect chiller temperature and ambient cooling conditions.
                </span>
              </button>

              <button className="action-card" onClick={handleDownloadReport}>
                <span className="action-card-label">Download Report PDF</span>
                <span className="action-card-subtitle">
                  Download a current system report using live subsystem summaries.
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ManagerView;