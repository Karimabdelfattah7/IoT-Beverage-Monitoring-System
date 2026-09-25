/**
 * SystemCard Component
 *
 * This component represents a high-level summary card for each subsystem
 * (example: Booster, Chiller, Dispenser) in the dashboard.
 *
 * Key Responsibilities:
 * - Display subsystem identity (image, title, short label)
 * - Show current system status with visual tone (good, warning, critical)
 * - Provide a brief summary and additional detail about the subsystem
 * - Indicate operational priority level
 * - Allow navigation to a detailed node-level (technical) view
 *
 * Props:
 * - system: object containing subsystem data (title, status, summary, image, etc.)
 * - onOpenNodeView: function triggered when user clicks "Open Node View"
 * - compact: optional flag for future layout variations (not currently used heavily)
 *
 * This component is mainly used in the Manager view to give a quick,
 * organized overview of all subsystems and allow users to drill down
 * into more detailed technical views when needed.
 */

function SystemCard({ system, onOpenNodeView, compact = false }) {
  return (
    <article className="system-card system-card-with-corner-image">
      <div className="corner-image-wrap">
        <img
          src={system.image}
          alt={system.title}
          className="corner-system-image"
        />
      </div>

      <div className="system-card-header">
        <div>
          <span className="system-small-label">{system.shortLabel}</span>
          <h3 className="system-title">{system.title}</h3>
        </div>

        <span className={`status-pill status-${system.statusTone}`}>
          {system.status}
        </span>
      </div>

      <p className="system-summary">{system.summary}</p>
      <p className="system-detail">{system.detail}</p>

      <div className="system-footer simplified-footer">
        <div className="priority-block">
          <span className="priority-label">Priority</span>
          <span className="priority-value">{system.priority}</span>
        </div>

        <div className="system-actions">
          <button
            className="ghost-action-btn"
            onClick={() => onOpenNodeView(system.id)}
          >
            Open Node View
          </button>
        </div>
      </div>
    </article>
  );
}

export default SystemCard;