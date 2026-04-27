// =========================================================
// QueueLess - Global Configuration
// Update BACKEND_URL with your Render backend URL before deploying.
// =========================================================

const BACKEND_URL = "https://queueless-wvkq.onrender.com"; // <-- Replace with your Render URL

const API_BASE = BACKEND_URL + "/api";
const WS_BASE = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://") + "/ws";
