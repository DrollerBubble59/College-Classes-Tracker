// ============================================================
// VT Todo Hub — Google Apps Script backend
// Deploy this as a Web App (Extensions > Apps Script in a Google
// Sheet, or script.google.com > New Project). See setup steps
// at the bottom of this file.
//
// This file is the source of truth for the backend. When it's
// edited (by Harrison or by Claude), copy/paste the updated
// contents into the Apps Script editor at script.google.com and
// push a new deployment version (Deploy > Manage deployments >
// pencil icon > Version: New version > Deploy).
// ============================================================

const CANVAS_ICS_URL = "https://canvas.vt.edu/feeds/calendars/user_A5M1u5vitUYWJgMIp0uMT745WbA7mjx5iv71tQA2.ics";

function doGet(e) {
  const action = (e.parameter.action || 'all');
  let result;
  try {
    if (action === 'canvas') {
      result = { events: getCanvasEvents() };
    } else if (action === 'todos') {
      result = { todos: getTodos() };
    } else if (action === 'all') {
      result = { events: getCanvasEvents(), todos: getTodos() };
    } else if (action === 'addTodo') {
      result = { todos: addTodo(e.parameter.text || '', e.parameter.date || '') };
    } else if (action === 'toggleTodo') {
      result = { todos: toggleTodo(e.parameter.id || '') };
    } else if (action === 'removeTodo') {
      result = { todos: removeTodo(e.parameter.id || '') };
    } else {
      result = { error: 'unknown action: ' + action };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Canvas ----------------

function getCanvasEvents() {
  const resp = UrlFetchApp.fetch(CANVAS_ICS_URL, { muteHttpExceptions: true });
  const text = resp.getContentText();
  return parseIcs(text);
}

function parseIcs(text) {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const lines = unfolded.split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).split(';')[0];
    const value = line.slice(idx + 1);
    if (key === 'SUMMARY') cur.title = value.replace(/\\,/g, ',').replace(/\\n/g, ' ');
    if (key === 'DTSTART') cur.due = parseIcsDate(value);
    if (key === 'UID') cur.uid = value;
  }
  const withDue = events.filter(function (ev) { return ev.due; });
  withDue.sort(function (a, b) { return new Date(a.due) - new Date(b.due); });
  const now = new Date();
  withDue.forEach(function (ev) {
    const d = new Date(ev.due);
    const diffDays = (d - now) / 86400000;
    ev.status = diffDays < 0 ? 'overdue' : (diffDays <= 7 ? 'soon' : 'later');
  });
  return withDue;
}

function parseIcsDate(val) {
  val = val.trim();
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const h = m[4], mi = m[5], s = m[6], z = m[7];
  let date;
  if (h === undefined) {
    date = new Date(y, mo - 1, d);
  } else if (z) {
    date = new Date(Date.UTC(y, mo - 1, d, Number(h), Number(mi), Number(s)));
  } else {
    date = new Date(y, mo - 1, d, Number(h), Number(mi), Number(s));
  }
  return date.toISOString();
}

// ---------------- Todos (persisted in Script Properties) ----------------

function getTodos() {
  const raw = PropertiesService.getScriptProperties().getProperty('todos');
  return raw ? JSON.parse(raw) : [];
}

function saveTodos(todos) {
  PropertiesService.getScriptProperties().setProperty('todos', JSON.stringify(todos));
}

function addTodo(text, date) {
  text = (text || '').trim();
  if (!text) return getTodos();
  // date is expected as "YYYY-MM-DD" from an HTML date input, or '' if none chosen.
  const cleanDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : null;
  const todos = getTodos();
  todos.unshift({ id: Utilities.getUuid(), text: text, date: cleanDate, done: false, added: Date.now() });
  saveTodos(todos);
  return todos;
}

function toggleTodo(id) {
  const todos = getTodos();
  const t = todos.filter(function (t) { return t.id === id; })[0];
  if (t) t.done = !t.done;
  saveTodos(todos);
  return todos;
}

function removeTodo(id) {
  let todos = getTodos();
  todos = todos.filter(function (t) { return t.id !== id; });
  saveTodos(todos);
  return todos;
}

// ============================================================
// SETUP STEPS
// 1. Go to https://script.google.com > New project.
// 2. Delete the default code, paste in this entire file.
// 3. Click Deploy > New deployment > gear icon > select "Web app".
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Click Deploy, authorize the permissions it asks for.
// 5. Copy the Web App URL (ends in /exec). Paste it into
//    SCRIPT_URL at the top of index.html.
// 6. Anytime you edit this code, use Deploy > Manage deployments >
//    edit (pencil) > New version, to push the update live.
// ============================================================
