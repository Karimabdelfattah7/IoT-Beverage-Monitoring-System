/**
 * Header Component
 *
 * This component represents the main top navigation header of the dashboard.
 * It displays branding information, system status metadata, and provides
 * a primary action button for switching between Manager and Technical views.
 *
 * Key Responsibilities:
 * - Display system branding (logo, system name, division)
 * - Show last synchronization timestamp for system data
 * - Provide a main action button to toggle between dashboard modes
 * - Maintain a clean and professional UI for top-level navigation
 *
 * Props:
 * - brand: object containing system name, division, and lastSync timestamp
 * - onPrimaryAction: function triggered when the main button is clicked
 * - managerMode: boolean that controls button label and current system mode
 *
 * This component is part of the overall dashboard layout and helps users
 * quickly identify system status and navigate between operational views.
 */

import multiplexLogo from "../assets/multiplex_logo.png";

function Header({ brand, onPrimaryAction, managerMode = true }) {
  return (
    <header className="header-shell">
      <div className="top-strip">
        <div className="top-strip-left">
          <span className="top-pill">Enterprise</span>
          <span className="top-meta">{brand.division}</span>
        </div>
      </div>

      <div className="main-header">
        <div className="brand-row">
          <img
            src={multiplexLogo}
            alt="Multiplex Logo"
            className="multiplex-logo"
          />

          <div>
            <h1 className="brand-title">{brand.name}</h1>
          </div>
        </div>

        <div className="header-actions">
          <div className="sync-box">
            <span className="sync-label">Last Synced</span>
            <span className="sync-value">{brand.lastSync}</span>
          </div>

          <button className="primary-header-btn" onClick={onPrimaryAction}>
            {managerMode ? "Open Technical Operations" : "Return to Manager View"}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;