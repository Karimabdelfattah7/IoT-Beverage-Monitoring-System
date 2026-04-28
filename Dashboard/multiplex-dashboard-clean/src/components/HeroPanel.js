/**
 * HeroPanel Component
 *
 * This component serves as the main overview section of the dashboard,
 * providing a high-level summary of overall system health and operational status.
 *
 * Key Responsibilities:
 * - Display a concise summary of system condition (healthy, warning, etc.)
 * - Highlight if any subsystem requires attention
 * - Show key contextual information such as service priority and region
 * - Present an overall health score using a visual indicator (health ring)
 *
 * This component is designed for Manager view, where users need a quick,
 * easy-to-understand snapshot of system performance without technical detail.
 */

function HeroPanel() {
  return (
    <section className="hero-panel">
      <div className="hero-left">
        <span className="hero-eyebrow">Operational Attention Required</span>
        <h2 className="hero-title">Enterprise System Health</h2>
        <p className="hero-description">
          All primary systems remain online. One subsystem is currently operating
          outside its expected performance range and should be reviewed.
        </p>

        <div className="hero-badges">
          <span className="info-badge">Service Priority: Medium</span>
          <span className="info-badge">Region: US Retail</span>
        </div>
      </div>

      <div className="hero-right">
        <div className="health-ring">
          <div className="health-ring-inner">
            <span className="health-value">94%</span>
            <span className="health-label">Stable</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroPanel;