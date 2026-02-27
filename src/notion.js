// src/notion.js
// All Notion API interaction lives here.
// The app calls these functions instead of touching Notion directly.

const PHASES_DB = "2cfbe763-4321-826e-b687-015146991e60";
const TASKS_DB  = "9f6be763-4321-82c7-be32-01e0662ebd56";

// Phase name → color (must match CATEGORIES in App.jsx)
const CATEGORY_COLORS = {
  "Definition":                "#f59e0b",
  "Design & Prototype":        "#3b82f6",
  "Compliance & Verification": "#8b5cf6",
  "Suppliers & Tooling":       "#10b981",
  "Marketing":                 "#ec4899",
  "Testing & Validation":      "#ef4444",
  "Launch Readiness":          "#f97316",
  "Product Launch":            "#06b6d4",
  "Refine & Scale":            "#84cc16",
  "Retrospective":             "#6b7280",
};

// ── Proxy helper ──────────────────────────────────────────────────────────────
// In development (Vite), requests to /api/notion are proxied via vite.config.js.
// In production (Vercel), the /api/notion.js serverless function handles it.

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

// ── Fetch all pages from a database (handles pagination) ─────────────────────
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

// ── Property extractors ───────────────────────────────────────────────────────
function getText(prop)        { return prop?.rich_text?.map(t => t.plain_text).join("") || ""; }
function getTitle(prop)       { return prop?.title?.map(t => t.plain_text).join("") || ""; }
function getSelect(prop)      { return prop?.select?.name || ""; }
function getStatus(prop)      { return prop?.status?.name || "Not Started"; }
function getDate(prop)        { return prop?.date?.start || ""; }
function getCheckbox(prop)    { return prop?.checkbox || false; }
function getNumber(prop)      { return prop?.number ?? null; }
function getRelationIds(prop) { return prop?.relation?.map(r => r.id) || []; }
function getPeople(prop)      { return prop?.people?.map(p => p.name).join(", ") || ""; }

// ── Transform a Notion task page → app milestone object ──────────────────────
function transformTask(page, phaseMap) {
  const p = page.properties;

  // Resolve phase name from the linked phase page ID
  const linkedPhaseIds = getRelationIds(p["Linked Phase"]);
  const phaseName = linkedPhaseIds.length > 0
    ? (phaseMap[linkedPhaseIds[0]] || "Definition")
    : "Definition";

  // Parse date — Notion gives us YYYY-MM-DD
  const rawDate = getDate(p["Deadline"]);

  // Month label for Gantt grouping
  const month = rawDate
    ? new Date(rawDate + "T12:00:00").toLocaleString("en-US", { month: "long", year: "numeric" })
    : "";

  return {
    // Use Notion page ID as the stable identifier
    id:          page.id,
    notionId:    page.id,   // explicit alias for clarity

    name:        getTitle(p["Task Name"]),
    date:        rawDate,
    month,
    category:    phaseName,
    description: "",        // loaded from page body separately if needed
    notes:       getText(p["Notes"]),
    priority:    getSelect(p["Priority"]) || "Medium",
    status:      getStatus(p["Status"]),
    owner:       getPeople(p["Owner"]),
    effort:      getNumber(p["Complexity"]),
    milestone:   getCheckbox(p["Milestone"]),

    // Dependency IDs — these are Notion page IDs of other tasks
    blockedBy:   getRelationIds(p["Depends on"]),
  };
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Load all phases and tasks from Notion.
 * Returns { milestones: [...], phases: [...] }
 */
export async function loadFromNotion() {
  // 1. Fetch all phases → build id→name lookup
  const phasePages = await queryAll(PHASES_DB, null, [
    { property: "Dates", direction: "ascending" },
  ]);

  const phaseMap = {};   // pageId → phase name
  const phases   = [];

  for (const page of phasePages) {
    const name = getTitle(page.properties["Phase Name"]);
    phaseMap[page.id] = name;
    phases.push({
      id:          page.id,
      name,
      color:       CATEGORY_COLORS[name] || "#6b7280",
      description: getText(page.properties["Phase Description"]),
      date:        getDate(page.properties["Dates"]),
    });
  }

  // 2. Fetch all tasks, sorted by deadline
  const taskPages = await queryAll(TASKS_DB, null, [
    { property: "Deadline", direction: "ascending" },
  ]);

  const milestones = taskPages.map(page => transformTask(page, phaseMap));

  return { milestones, phases };
}

/**
 * Update a single field on a Notion task page.
 * fieldName: the app field name (e.g. "name", "priority", "status")
 * value: the new value
 */
export async function updateTask(notionId, fieldName, value) {
  const properties = fieldToNotionProperties(fieldName, value);
  if (!properties) return; // unmapped field, skip

  await notionFetch(`/pages/${notionId}`, "PATCH", { properties });
}

/**
 * Update the blockedBy (Depends on) relation for a task.
 * newBlockedByIds: array of Notion page IDs
 */
export async function updateDependencies(notionId, newBlockedByIds) {
  await notionFetch(`/pages/${notionId}`, "PATCH", {
    properties: {
      "Depends on": {
        relation: newBlockedByIds.map(id => ({ id })),
      },
    },
  });
}

/**
 * Create a new task in Notion with default values.
 * Returns the new milestone object.
 */
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

/**
 * Archive (soft-delete) a task in Notion.
 */
export async function deleteTask(notionId) {
  await notionFetch(`/pages/${notionId}`, "PATCH", { archived: true });
}

// ── Map app field names → Notion property patch format ───────────────────────
function fieldToNotionProperties(fieldName, value) {
  switch (fieldName) {
    case "name":
      return { "Task Name": { title: [{ text: { content: value } }] } };

    case "date":
      return { "Deadline": value ? { date: { start: value } } : { date: null } };

    case "priority":
      return { "Priority": { select: { name: value } } };

    case "status":
      return { "Status": { status: { name: value } } };

    case "notes":
      return { "Notes": { rich_text: [{ text: { content: value } }] } };

    case "effort":
      return { "Complexity": { number: value === "" ? null : Number(value) } };

    case "milestone":
      return { "Milestone": { checkbox: Boolean(value) } };

    // owner (people) requires user IDs — skip for now, Notion people fields
    // need a Notion user ID lookup which requires extra API calls.
    // We display owner read-only for now.
    case "owner":
      return null;

    // category change requires updating the Linked Phase relation.
    // Handled separately via updateLinkedPhase().
    case "category":
      return null;

    default:
      return null;
  }
}

/**
 * Update the Linked Phase relation when category changes.
 * phaseName: the new phase name string
 * phases: the phases array from loadFromNotion()
 */
export async function updateLinkedPhase(notionId, phaseName, phases) {
  const phase = phases.find(p => p.name === phaseName);
  if (!phase) return;

  await notionFetch(`/pages/${notionId}`, "PATCH", {
    properties: {
      "Linked Phase": {
        relation: [{ id: phase.id }],
      },
    },
  });
}
