/**
 * TechnicianView Component
 *
 * This component represents the main technician-level dashboard page.
 * It provides tab-based navigation between the technical overview and
 * subsystem-specific diagnostic views for Dispenser, Booster, and Chiller.
 *
 * Key Responsibilities:
 * - Read the active tab from the URL query parameter
 * - Navigate between technical subsystem views
 * - Render the correct dashboard component based on the selected tab
 * - Provide a return path back to the Manager View
 * - Keep technician navigation organized and easy to access
 *
 * Technologies Used:
 * - React (useMemo)
 * - React Router (useLocation, useNavigate)
 *
 * This view is designed for technical users who need deeper access to
 * node-level metrics, charts, and diagnostic information.
 */

import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DispenserView from "../components/DispenserView";
import BoosterView from "../components/BoosterView";
import ChillerView from "../components/ChillerView";
import TechnicalOverview from "../components/TechnicalOverview";
import "./TechnicianView.css";

const TAB_OPTIONS = [
  { key: "overview", label: "Overview" },
  { key: "dispenser", label: "Dispenser" },
  { key: "booster", label: "Booster" },
  { key: "chiller", label: "Chiller" },
];

function TechnicianView() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab") || "overview";

    if (TAB_OPTIONS.some((item) => item.key === tab)) {
      return tab;
    }

    return "overview";
  }, [location.search]);

  const setActiveTab = (tab) => {
    navigate(`/technician?tab=${tab}`);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "dispenser":
        return <DispenserView mode="full" />;
      case "booster":
        return <BoosterView />;
      case "chiller":
        return <ChillerView />;
      case "overview":
      default:
        return <TechnicalOverview onOpenTab={setActiveTab} />;
    }
  };

  return (
    <div className="page-shell">
      <div className="dashboard-container">
        <section className="technician-top-panel">
          <span className="hero-eyebrow">Technical Operations</span>
          <h1 className="technician-title">Technical View</h1>
          <p className="technician-subtitle">
            Node-level diagnostics for dispenser, booster, and chiller.
          </p>

          <div className="tab-bar">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? "tab-active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}

            <button className="tab-btn" onClick={() => navigate("/")}>
              Manager View
            </button>
          </div>
        </section>

        <section className="technician-content-area">
          {renderActiveView()}
        </section>
      </div>
    </div>
  );
}

export default TechnicianView;