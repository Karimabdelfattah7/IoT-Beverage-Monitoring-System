/**
 * API Base Configuration
 *
 * This defines the base URL for the backend server that the frontend will call.
 * Update the IP address below to match the machine running your backend.
 *
 * ----------------------------------------
 * How to find your IP address:
 *
 * Mac:
 * 1. Open Terminal
 * 2. Run: ifconfig
 * 3. Look for "inet 192.168.x.x" under your active network (Wi-Fi)
 *
 * Windows:
 * 1. Open Command Prompt
 * 2. Run: ipconfig
 * 3. Look for "IPv4 Address: 192.168.x.x"
 *
 * ----------------------------------------
 * Important:
 * - The frontend and backend must be on the SAME network
 * - Do NOT use "localhost" if accessing from another device
 * - Make sure your backend is running on port 4000
 *
 * Example test in browser:
 * http://192.168.x.x:4000/api/dispenser/summary
 */

const API_BASE = "http://192.168.1.22:4000/api";

export default API_BASE;