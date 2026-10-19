const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

/* ========================================
   CONFIGURATION
======================================== */

let GOOGLE_CREDENTIALS = null;

// Essayer d'abord depuis les variables d'environnement (Vercel)
if (process.env.GOOGLE_CREDENTIALS) {
  try {
    GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log("✓ Google credentials loaded from environment");
  } catch (err) {
    console.error("Error parsing GOOGLE_CREDENTIALS env var:", err.message);
  }
}

// Si pas de variables d'environnement, essayer config.json (développement local)
if (!GOOGLE_CREDENTIALS) {
  try {
    const configData = fs.readFileSync("./config.json", "utf8");
    GOOGLE_CREDENTIALS = JSON.parse(configData);
    console.log("✓ Google credentials loaded from config.json");
  } catch (err) {
    console.warn("⚠ No config.json found and no GOOGLE_CREDENTIALS env var");
  }
}

// Sheet ID — extrait de l'URL
const SHEET_ID = process.env.SHEET_ID || "11VvZeJyN9Spw5SbYTtDXozKerKOZW0gzT-qF7juFZOY";

// Plage des tâches dans le Sheet
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

// GET /api/tasks — récupère toutes les tâches
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

// POST /api/tasks — ajoute une tâche
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

// PUT /api/tasks/:id — met à jour une tâche
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

// DELETE /api/tasks/:id — supprime une tâche
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

// GET /api/calendar/events — récupère les événements du jour
app.get("/api/calendar/events", async (req, res) => {
  try {
    if (!calendar) return res.status(500).json({ error: "Google not configured" });

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
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
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date
    }));

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar/events — crée un événement
app.post("/api/calendar/events", async (req, res) => {
  try {
    const { title, start, end, description } = req.body;
    if (!calendar) return res.status(500).json({ error: "Google not configured" });

    const event = {
      summary: title,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      reminders: { useDefault: true }
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event
    });

    res.json({ success: true, eventId: response.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar/events/:id — supprime un événement
app.delete("/api/calendar/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!calendar) return res.status(500).json({ error: "Google not configured" });

    await calendar.events.delete({
      calendarId: "primary",
      eventId: id
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ========================================
   STATIC FILES — Serve WILL.AI frontend
======================================== */

app.use(express.static('public'));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
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
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`Google configured: ${auth ? "✓ yes" : "✗ no"}`);
  console.log(`Frontend: http://localhost:${PORT}\n`);
});
