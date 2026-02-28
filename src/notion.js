// src/notion.js
const PHASES_DB = "2cfbe763-4321-826e-b687-015146991e60";
const TASKS_DB  = "9f6be763-4321-82c7-be32-01e0662ebd56";

const PALETTE = [
  "#f59e0b","#3b82f6","#8b5cf6","#10b981","#ec4899",
  "#ef4444","#f97316","#06b6d4","#84cc16","#6b7280",
  "#a855f7","#14b8a6","#f43f5e","#eab308","#64748b",
];

async function notionFetch(path, method="GET", body=null) {
  const res = await fetch(`/api/notion?path=${encodeURIComponent(path)}`, {
    method, headers:{"Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(`Notion API error ${res.status}: ${err.message||res.statusText}`);
  }
  return res.json();
}

async function queryAll(dbId, filter=null, sorts=null) {
  const pages=[]; let cursor=undefined;
  while(true) {
    const body={page_size:100};
    if(filter) body.filter=filter;
    if(sorts)  body.sorts=sorts;
    if(cursor) body.start_cursor=cursor;
    const data=await notionFetch(`/databases/${dbId}/query`,"POST",body);
    pages.push(...data.results);
    if(!data.has_more) break;
    cursor=data.next_cursor;
  }
  return pages;
}

function getText(prop)        { return prop?.rich_text?.map(t=>t.plain_text).join("")||""; }
function getTitle(prop)       { return prop?.title?.map(t=>t.plain_text).join("")||""; }
function getSelect(prop)      { return prop?.select?.name||""; }
function getStatus(prop)      { return prop?.status?.name||"Not Started"; }
function getDate(prop)        { return prop?.date?.start||""; }
function getCheckbox(prop)    { return prop?.checkbox||false; }
function getNumber(prop)      { return prop?.number??null; }
function getRelationIds(prop) { return prop?.relation?.map(r=>r.id)||[]; }
function getPeople(prop)      { return prop?.people?.map(p=>p.name).join(", ")||""; }

function transformTask(page, phaseMap) {
  const p = page.properties;
  const linkedPhaseIds = getRelationIds(p["Linked Phase"]);
  const phaseName = linkedPhaseIds.length>0 ? (phaseMap[linkedPhaseIds[0]]||"") : "";
  const rawDate = getDate(p["Deadline"]);
  const rawStartDate = getDate(p["Start Date"]);
  const month = rawDate
    ? new Date(rawDate+"T12:00:00").toLocaleString("en-US",{month:"long",year:"numeric"})
    : "";
  const notes = getText(p["Notes (TickTick)"])||getText(p["Notes"])||"";
  return {
    id:        page.id,
    notionId:  page.id,
    name:      getTitle(p["Task Name"]),
    date:      rawDate,
    startDate: rawStartDate,
    month,
    category:  phaseName,
    description: "",
    notes,
    priority:  getSelect(p["Priority"])||"Medium",
    status:    getStatus(p["Status"]),
    owner:     getPeople(p["Owner"]),
    effort:    getNumber(p["Complexity"]),
    milestone: getCheckbox(p["Milestone"]),
    blockedBy: getRelationIds(p["Depends on"]),
  };
}

export async function loadFromNotion() {
  const phasePages = await queryAll(PHASES_DB, null, [{property:"Dates",direction:"ascending"}]);
  const phaseMap={}, phases=[];
  phasePages.forEach((page,index)=>{
    const name  = getTitle(page.properties["Phase Name"]);
    const color = PALETTE[index%PALETTE.length];
    phaseMap[page.id]=name;
    phases.push({id:page.id,name,color,description:getText(page.properties["Phase Description"]),date:getDate(page.properties["Dates"])});
  });
  const categories = Object.fromEntries(phases.map(p=>[p.name,p.color]));
  const taskPages = await queryAll(TASKS_DB, null, [{property:"Deadline",direction:"ascending"}]);
  const milestones = taskPages.map(page=>transformTask(page,phaseMap));
  return {milestones,phases,categories};
}

export async function updateTask(notionId, fieldName, value) {
  const properties = fieldToNotionProperties(fieldName, value);
  if(!properties) return;
  await notionFetch(`/pages/${notionId}`,"PATCH",{properties});
}

export async function updateDependencies(notionId, newBlockedByIds) {
  await notionFetch(`/pages/${notionId}`,"PATCH",{
    properties:{"Depends on":{relation:newBlockedByIds.map(id=>({id}))}},
  });
}

export async function updateLinkedPhase(notionId, phaseName, phases) {
  const phase = phases.find(p=>p.name===phaseName);
  if(!phase) return;
  await notionFetch(`/pages/${notionId}`,"PATCH",{
    properties:{"Linked Phase":{relation:[{id:phase.id}]}},
  });
}

export async function createTask(phaseMap) {
  const today = new Date().toISOString().split("T")[0];
  const page = await notionFetch(`/pages`,"POST",{
    parent:{database_id:TASKS_DB},
    properties:{
      "Task Name":{title:[{text:{content:"New Task"}}]},
      "Deadline":{date:{start:today}},
      "Priority":{select:{name:"Medium"}},
      "Status":{status:{name:"Not Started"}},
      "Milestone":{checkbox:false},
    },
  });
  return transformTask(page,phaseMap||{});
}

export async function deleteTask(notionId) {
  await notionFetch(`/pages/${notionId}`,"PATCH",{archived:true});
}

function fieldToNotionProperties(fieldName, value) {
  switch(fieldName) {
    case "name":      return {"Task Name":{title:[{text:{content:value}}]}};
    case "date":      return {"Deadline":value?{date:{start:value}}:{date:null}};
    case "priority":  return {"Priority":{select:{name:value}}};
    case "status":    return {"Status":{status:{name:value}}};
    case "notes":     return {"Notes":{rich_text:[{text:{content:value}}]}};
    case "effort":    return {"Complexity":{number:value===""?null:Number(value)}};
    case "milestone": return {"Milestone":{checkbox:Boolean(value)}};
    default:          return null;
  }
}
