/**
 * App Component (Root Router)
 *
 * This is the main entry point of the React application.
 * It sets up client-side routing between the Manager and Technician dashboards.
 *
 * Routes:
 * - "/" → ManagerView (high-level system overview for non-technical users)
 * - "/technician" → TechnicianView (detailed diagnostics and subsystem views)
 *
 * Key Responsibilities:
 * - Initialize React Router (BrowserRouter)
 * - Define application routes
 * - Serve as the root layout container for all pages
 *
 * Notes:
 * - Navigation between views is handled using react-router (useNavigate)
 * - Additional routes (example: future subsystems or auth) can be added here
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import ManagerView from "./pages/ManagerView";
import TechnicianView from "./pages/TechnicianView";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ManagerView />} />
        <Route path="/technician" element={<TechnicianView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;