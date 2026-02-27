// src/notion.js
// All Notion API interaction lives here.

const PHASES_DB = "2cfbe763-4321-826e-b687-015146991e60";
const TASKS_DB  = "9f6be763-4321-82c7-be32-01e0662ebd56";

// Auto-assigned color palette — cycles through for however many phases exist.
// Order is chosen to be visually distinct and avoid adjacent clashes.
const PALETTE = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#6b7280", // gray
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#eab308", // yellow
  "#64748b", // slate
];

// ── Proxy helper ───────────────────────────────────────────────────────────────
async function notionFetch(path, method = "GET", body = null) {
  const res = await fetch(`/api/notion?path=${encodeURIComponent(path)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion API error ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

// ── Fetch all pages from a database (handles pagination) ──────────────────────
async function queryAll(dbId, filter = null, sorts = null) {
  const pages = [];
  let cursor = undefined;
  while (true) {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts)  body.sorts  = sorts;
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/databases/${dbId}/query`, "POST", body);
    pages.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return pages;
}

// ── Property extractors ────────────────────────────────────────────────────────
function getText(prop)        { return prop?.rich_text?.map(t => t.plain_text).join("") || ""; }
function getTitle(prop)       { return prop?.title?.map(t => t.plain_text).join("") || ""; }
function getSelect(prop)      { return prop?.select?.name || ""; }
function getStatus(prop)      { return prop?.status?.name || "Not Started"; }
function getDate(prop)        { return prop?.date?.start || ""; }
function getCheckbox(prop)    { return prop?.checkbox || false; }
function getNumber(prop)      { return prop?.number ?? null; }
function getRelationIds(prop) { return prop?.relation?.map(r => r.id) || []; }
function getPeople(prop)      { return prop?.people?.map(p => p.name).join(", ") || ""; }

// ── Transform a Notion task page → app milestone object ───────────────────────
function transformTask(page, phaseMap) {
  const p = page.properties;
  const linkedPhaseIds = getRelationIds(p["Linked Phase"]);
  const phaseName = linkedPhaseIds.length > 0
    ? (phaseMap[linkedPhaseIds[0]] || "")
    : "";
  const rawDate = getDate(p["Deadline"]);
  const month = rawDate
    ? new Date(rawDate + "T12:00:00").toLocaleString("en-US", { month: "long", year: "numeric" })
    : "";
  return {
    id:        page.id,
    notionId:  page.id,
    name:      getTitle(p["Task Name"]),
    date:      rawDate,
    month,
    category:  phaseName,
    description: "",
    notes:     getText(p["Notes"]),
    priority:  getSelect(p["Priority"]) || "Medium",
    status:    getStatus(p["Status"]),
    owner:     getPeople(p["Owner"]),
    effort:    getNumber(p["Complexity"]),
    milestone: getCheckbox(p["Milestone"]),
    blockedBy: getRelationIds(p["Depends on"]),
  };
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────

/**
 * Load all phases and tasks from Notion.
 * Returns { milestones, phases, categories }
 * - phases: array of { id, name, color, description, date }
 * - categories: { [phaseName]: colorHex } — derived dynamically, no hardcoding
 */
export async function loadFromNotion() {
  // 1. Fetch phases sorted by date → assign palette colors by index
  const phasePages = await queryAll(PHASES_DB, null, [
    { property: "Dates", direction: "ascending" },
  ]);

  const phaseMap = {};  // pageId → phase name
  const phases   = [];

  phasePages.forEach((page, index) => {
    const name  = getTitle(page.properties["Phase Name"]);
    const color = PALETTE[index % PALETTE.length];
    phaseMap[page.id] = name;
    phases.push({
      id:          page.id,
      name,
      color,
      description: getText(page.properties["Phase Description"]),
      date:        getDate(page.properties["Dates"]),
    });
  });

  // 2. Derive categories lookup from live phases — no hardcoding
  const categories = Object.fromEntries(phases.map(p => [p.name, p.color]));

  // 3. Fetch all tasks sorted by deadline
  const taskPages = await queryAll(TASKS_DB, null, [
    { property: "Deadline", direction: "ascending" },
  ]);

  const milestones = taskPages.map(page => transformTask(page, phaseMap));

  return { milestones, phases, categories };
}

export async function updateTask(notionId, fieldName, value) {
  const properties = fieldToNotionProperties(fieldName, value);
  if (!properties) return;
  await notionFetch(`/pages/${notionId}`, "PATCH", { properties });
}

export async function updateDependencies(notionId, newBlockedByIds) {
  await notionFetch(`/pages/${notionId}`, "PATCH", {
    properties: {
      "Depends on": { relation: newBlockedByIds.map(id => ({ id })) },
    },
  });
}

export async function createTask(phaseMap) {
  const today = new Date().toISOString().split("T")[0];
  const page = await notionFetch(`/pages`, "POST", {
    parent: { database_id: TASKS_DB },
    properties: {
      "Task Name": { title: [{ text: { content: "New Task" } }] },
      "Deadline":  { date: { start: today } },
      "Priority":  { select: { name: "Medium" } },
      "Status":    { status: { name: "Not Started" } },
      "Milestone": { checkbox: false },
    },
  });
  return transformTask(page, phaseMap || {});
}

export async function deleteTask(notionId) {
  await notionFetch(`/pages/${notionId}`, "PATCH", { archived: true });
}

export async function updateLinkedPhase(notionId, phaseName, phases) {
  const phase = phases.find(p => p.name === phaseName);
  if (!phase) return;
  await notionFetch(`/pages/${notionId}`, "PATCH", {
    properties: {
      "Linked Phase": { relation: [{ id: phase.id }] },
    },
  });
}

function fieldToNotionProperties(fieldName, value) {
  switch (fieldName) {
    case "name":      return { "Task Name": { title: [{ text: { content: value } }] } };
    case "date":      return { "Deadline": value ? { date: { start: value } } : { date: null } };
    case "priority":  return { "Priority": { select: { name: value } } };
    case "status":    return { "Status": { status: { name: value } } };
    case "notes":     return { "Notes": { rich_text: [{ text: { content: value } }] } };
    case "effort":    return { "Complexity": { number: value === "" ? null : Number(value) } };
    case "milestone": return { "Milestone": { checkbox: Boolean(value) } };
    case "owner":     return null; // people fields need user ID lookup
    case "category":  return null; // handled via updateLinkedPhase()
    default:          return null;
  }
}
