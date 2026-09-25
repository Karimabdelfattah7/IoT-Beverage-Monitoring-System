/**
 * KpiCard Component
 *
 * This component displays a single key performance indicator (KPI) in a compact card format.
 * It is used to highlight important system metrics such as counts, averages, or status values.
 *
 * Key Responsibilities:
 * - Present a labeled metric value clearly and prominently
 * - Apply visual styling based on the tone (example: good, warning, critical, neutral)
 * - Support consistent KPI display across different dashboard sections
 *
 * Props:
 * - label: description of the metric being displayed
 * - value: numeric or text value of the KPI
 * - tone: visual state used for styling (default: "neutral")
 */

function KpiCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  );
}

export default KpiCard;