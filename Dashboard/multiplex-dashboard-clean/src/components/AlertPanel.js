/**
 * AlertPanel Component
 *
 * This component displays a list of active system alerts in the dashboard.
 * It presents alert information such as title, description, and severity level
 * in a structured and easy-to-read format.
 *
 * Key Responsibilities:
 * - Render all active alerts passed from the parent component
 * - Display alert details (title, subtitle, severity)
 * - Provide a clear visual indication of system issues
 *
 * Props:
 * - alerts: array of alert objects containing id, title, subtitle, and severity
 */

function AlertPanel({ alerts }) {
  return (
    <section className="panel-card">
      <div className="panel-header">
        <div className="alert-title-row">
          <div className="warning-icon-wrap">
            <span className="warning-icon">⚠</span>
          </div>

          <div>
            <span className="panel-eyebrow">Incident Summary</span>
            <h3 className="panel-title">Active Operational Alerts</h3>
          </div>
        </div>
      </div>

      <div className="alert-list">
        {alerts.map((alert) => (
          <div className="alert-item" key={alert.id}>
            <div className="alert-item-left">
              <div>
                <h4 className="alert-title">{alert.title}</h4>
                <p className="alert-subtitle">{alert.subtitle}</p>
              </div>
            </div>

            <div className="alert-item-right">
              <span className="severity-pill">{alert.severity}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default AlertPanel;