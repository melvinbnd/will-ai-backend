const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

/* ========================================
   CONFIGURATION
======================================== */

let GOOGLE_CREDENTIALS = null;

// 1) Vercel : variable d'environnement
if (process.env.GOOGLE_CREDENTIALS) {
  try {
    GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log("Google credentials: env");
  } catch (err) {
    console.error("Erreur parsing GOOGLE_CREDENTIALS:", err.message);
  }
}

// 2) Local : config.json
if (!GOOGLE_CREDENTIALS) {
  try {
    const configPath = path.join(process.cwd(), "config.json");
    GOOGLE_CREDENTIALS = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("Google credentials: config.json");
  } catch (err) {
    console.warn("Pas de credentials Google trouvees");
  }
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
   HEALTH CHECK
======================================== */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    google: auth ? "configured" : "not configured",
    cwd: process.cwd()
  });
});

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
    const tasks = rows.map(row => ({
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

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: TASKS_RANGE,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[id, project, prio, title, meta, due]] }
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

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `WILLIAM!A${idx + 2}:F${idx + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[id, project, prio, title, meta, due]] }
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
   CALENDAR — CRUD
======================================== */

app.get("/api/calendar/events", async (req, res) => {
  try {
    if (!calendar) return res.status(500).json({ error: "Google not configured" });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      start: e.start && (e.start.dateTime || e.start.date),
      end: e.end && (e.end.dateTime || e.end.date)
    }));

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/calendar/events", async (req, res) => {
  try {
    const { title, start, end, description } = req.body;
    if (!calendar) return res.status(500).json({ error: "Google not configured" });

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: {
        summary: title,
        description,
        start: { dateTime: start },
        end: { dateTime: end },
        reminders: { useDefault: true }
      }
    });

    res.json({ success: true, eventId: response.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/calendar/events/:id", async (req, res) => {
  try {
    if (!calendar) return res.status(500).json({ error: "Google not configured" });
    await calendar.events.delete({ calendarId: "primary", eventId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ========================================
   FRONTEND WILL.AI
======================================== */

const PUBLIC_DIR = path.join(process.cwd(), "public");

app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  const filePath = path.join(PUBLIC_DIR, "index.html");
  try {
    const html = fs.readFileSync(filePath, "utf8");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("index.html introuvable:", filePath, err.message);
    res.status(500).send("index.html introuvable a " + filePath);
  }
});

/* ========================================
   DEMARRAGE
======================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server on port " + PORT);
  console.log("Google: " + (auth ? "ok" : "non configure"));
  console.log("Public dir: " + PUBLIC_DIR);
});

module.exports = app;
