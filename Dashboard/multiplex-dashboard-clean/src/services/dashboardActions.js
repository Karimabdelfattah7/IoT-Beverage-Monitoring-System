/**
 * Dashboard Action Handlers
 *
 * This file contains utility functions used to trigger navigation
 * and high-level actions across the Manager and Technician dashboards.
 *
 * Key Responsibilities:
 * - Navigate between Manager and Technician views
 * - Trigger system refresh actions
 * - Handle export and external dashboard interactions (placeholders)
 *
 * Notes:
 * - Some functions (like export and Grafana) are currently placeholders
 *   and can be extended later with real integrations.
 */

export function openTechnicalOperations(navigate) {
  navigate("/technician");
}

export function returnToManagerView(navigate) {
  navigate("/");
}

export function exportStatusSnapshot() {
  console.log("Export status snapshot requested");
}

export function refreshSystemStatus() {
  console.log("Refresh system status requested");
  window.location.reload();
}

export function openGrafanaDashboard(tabKey) {
  console.log("Open Grafana dashboard:", tabKey);
}