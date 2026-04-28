/*
  Dashboard Configuration

  This file centralizes all static configuration data used across the UI:
  - Branding information
  - KPI summary values
  - System metadata (Chiller, Dispenser, Booster)
  - Alerts
  - External dashboard links (Grafana)

  Keeping this separate improves maintainability and allows easy updates
  without modifying core components.
*/

import chillerImg from "../assets/chiller.png";
import dispenserImg from "../assets/dispenser.png";
import boosterImg from "../assets/booster.png";

export const BRAND = {
  name: "Beverage Systems",
  division: "Retail Operations Monitoring",
  storeName: "Store #102 · Downtown Louisville",
  lastSync: "12:42 PM",
};

export const KPI_DATA = [
  { label: "System Health", value: "94%", tone: "good" },
  { label: "Devices Online", value: "3/3", tone: "neutral" },
  { label: "Open Alerts", value: "1", tone: "warning" },
  { label: "Critical Issues", value: "0", tone: "good" },
];

export const SYSTEMS = [
  {
    id: "chiller",
    title: "Chiller",
    image: chillerImg,
    status: "Operational",
    statusTone: "good",
    shortLabel: "Cooling",
    summary: "Cooling subsystem is performing within normal range.",
    detail: "No issues detected in the current monitoring window.",
    priority: "Low",
  },
  {
    id: "dispenser",
    title: "Dispenser",
    image: dispenserImg,
    status: "Attention Needed",
    statusTone: "warning",
    shortLabel: "Dispensing",
    summary: "Dispensing subsystem is operating outside target range.",
    detail: "Flow performance is below expected output.",
    priority: "Medium",
  },
  {
    id: "booster",
    title: "Booster Pump",
    image: boosterImg,
    status: "Operational",
    statusTone: "good",
    shortLabel: "Pressure",
    summary: "Pressure support remains stable across active lines.",
    detail: "No pressure irregularities detected.",
    priority: "Low",
  },
];

export const ALERTS = [
  {
    id: "alert-1",
    title: "Dispenser performance below target range",
    subtitle: "Service review recommended for reduced output condition.",
    severity: "Medium",
    system: "Dispenser",
  },
];

export const GRAFANA_URLS = {
  technical:
    "http://localhost:3000/d/adxh6j6/new-dashboard?orgId=1&theme=dark&kiosk",
};