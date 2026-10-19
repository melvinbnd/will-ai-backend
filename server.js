require('dotenv').config();

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

/* Servir les fichiers statiques (WILL.AI depuis public/) */
app.use(express.static('public'));

/* ========================================
   CONFIGURATION
======================================== */

let GOOGLE_CREDENTIALS = null;
try {
  const configPath = path.join(__dirname, "config.json");
  const configData = fs.readFileSync(configPath, "utf8");
  GOOGLE_CREDENTIALS = JSON.parse(configData);
} catch (err) {
  console.error("Error reading config.json:", err.message);
}

const SHEET_ID = process.env.SHEET_ID || "11VvZeJyN9Spw5SbYTtDXozKerKOZW0gzT-qF7juFZOY";
const TASKS_RANGE = "WILLIAM!A2:F100";

/* ========================================
   GOOGLE AUTH
======================================== */

let auth = null;
let sheets = null;
let calendar = null;

if (GOOGLE_CREDENTIALS) {
  auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/calendar"
    ]
  });
  sheets = google.sheets({ version: "v4", auth });
  calendar = google.calendar({ version: "v3", auth });
}

/* ========================================
   TASKS — CRUD
======================================== */

app.get("/api/tasks", async (req, res) => {
  try {
    if (!sheets) return res.status(500).json({ error: "Google not configured" });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE
    });

    const rows = response.data.values || [];
    const tasks = rows.map((row, idx) => ({
      id: row[0],
      project: row[1],
      prio: parseInt(row[2] || 1),
      title: row[3],
      meta: row[4],
      due: row[5] || null
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { id, project, prio, title, meta, due } = req.body;
    if (!sheets) return res.status(500).json({ error: "Google not configured" });

    const values = [[id, project, prio, title, meta, due]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE,
      valueInputOption: "USER_ENTERED",
      resource: { values }
    });

    res.json({ success: true, task: { id, project, prio, title, meta, due } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { project, prio, title, meta, due } = req.body;
    if (!sheets) return res.status(500).json({ error: "Google not configured" });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE
    });
    const rows = response.data.values || [];
    const idx = rows.findIndex(r => r[0] === id);

    if (idx === -1) return res.status(404).json({ error: "Task not found" });

    rows[idx] = [id, project, prio, title, meta, due];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `WILLIAM!A${idx + 2}:F${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [rows[idx]] }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!sheets) return res.status(500).json({ error: "Google not configured" });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE
    });
    const rows = response.data.values || [];
    const idx = rows.findIndex(r => r[0] === id);

    if (idx === -1) return res.status(404).json({ error: "Task not found" });

    rows.splice(idx, 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE,
      valueInputOption: "USER_ENTERED",
      resource: { values: rows }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ========================================
   HEALTH CHECK
======================================== */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    google: auth ? "configured" : "not configured"
  });
});

/* ========================================
   DÉMARRAGE
======================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Google configured: ${auth ? "yes" : "no"}`);
  console.log(`Serving WILL.AI from public/ folder`);
});
