/**
 * ActionPanel Component
 *
 * This component renders a set of operational control buttons for the dashboard.
 * It supports both Manager and Technical views by conditionally displaying actions
 * based on the `technicalMode` flag.
 *
 * Key Responsibilities:
 * - Provide quick access to system actions (open technical view, export data, refresh)
 * - Adapt UI behavior depending on the current dashboard mode
 * - Trigger parent-defined handlers through props
 *
 * Props:
 * - onOpenTechnical: function to switch to technical dashboard view
 * - onExport: function to export current system snapshot
 * - onRefresh: function to refresh live system data
 * - technicalMode: boolean flag indicating current dashboard mode
 */

function ActionPanel({
  onOpenTechnical,
  onExport,
  onRefresh,
  technicalMode = false,
}) {
  return (
    <section className="panel-card action-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Recommended Actions</span>
          <h3 className="panel-title">
            {technicalMode ? "Technical Controls" : "Operations Controls"}
          </h3>
        </div>
      </div>

      <div className="action-grid">
        {!technicalMode && (
          <button className="action-card primary-action-card" onClick={onOpenTechnical}>
            <span className="action-card-label">Open Technical Operations</span>
            <span className="action-card-subtitle">
              Open detailed node-level dashboards and diagnostics
            </span>
          </button>
        )}

        <button className="action-card" onClick={onExport}>
          <span className="action-card-label">Export Status Snapshot</span>
          <span className="action-card-subtitle">
            Save the current operational summary for reporting
          </span>
        </button>

        <button className="action-card" onClick={onRefresh}>
          <span className="action-card-label">Refresh Live Status</span>
          <span className="action-card-subtitle">
            Reload system conditions from the current monitoring session
          </span>
        </button>
      </div>
    </section>
  );
}

export default ActionPanel;