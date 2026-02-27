import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { loadFromNotion, updateTask, updateDependencies, updateLinkedPhase } from "./notion.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const PRIORITIES = { High:"#ef4444", Medium:"#f59e0b", Low:"#6b7280" };
const STATUSES   = { "Not Started":"#374151","In Progress":"#3b82f6","Waiting / Blocked":"#f97316","Done":"#10b981" };
const MONTHS = ["March 2026","April 2026","May 2026","June 2026","July 2026","August 2026","September 2026"];
const MONTH_STARTS = {"March 2026":new Date("2026-03-01"),"April 2026":new Date("2026-04-01"),"May 2026":new Date("2026-05-01"),"June 2026":new Date("2026-06-01"),"July 2026":new Date("2026-07-01"),"August 2026":new Date("2026-08-01"),"September 2026":new Date("2026-09-01")};
const PROJECT_START = new Date("2026-03-01");
const PROJECT_END   = new Date("2026-09-30");
const FB = "#6b7280";
const SETTINGS_KEY = "roadmap_panel_filters_v1";

function pct(d){return((new Date(d)-PROJECT_START)/(PROJECT_END-PROJECT_START))*100;}
function dateToMonth(d){const x=new Date(d+"T12:00:00");return x.toLocaleString("en-US",{month:"long"})+" "+x.getFullYear();}
function fmtDate(d){if(!d)return"";return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function fmtDateLong(d){if(!d)return"No date";return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});}

function isReady(m, allMilestones) {
  if (m.status === "Done") return false;
  if (!m.blockedBy || m.blockedBy.length === 0) return true;
  return m.blockedBy.every(depId => {
    const dep = allMilestones.find(x => x.id === depId);
    return !dep || dep.status === "Done";
  });
}

function useIsMobile(){
  const [v,setV]=useState(typeof window!=="undefined"?window.innerWidth<768:false);
  useEffect(()=>{const h=()=>setV(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return v;
}

function buildChain(id,milestones){
  if(!id)return new Set();
  const chain=new Set([id]);
  const addDeps=(mid)=>{const m=milestones.find(x=>x.id===mid);if(!m)return;m.blockedBy.forEach(dep=>{if(!chain.has(dep)){chain.add(dep);addDeps(dep);}});};
  const addDependents=(mid)=>{milestones.forEach(m=>{if((m.blockedBy||[]).includes(mid)&&!chain.has(m.id)){chain.add(m.id);addDependents(m.id);}});};
  addDeps(id);addDependents(id);
  return chain;
}

function loadSettings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");}catch{return{};}
}
function saveSettings(s){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}catch{}
}

// ── Loading Screen ─────────────────────────────────────────────────────────────
function LoadingScreen({error,onRetry}){
  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px"}}>
      {error?(
        <>
          <div style={{fontSize:"11px",color:"#ef4444",maxWidth:"400px",textAlign:"center",lineHeight:"1.8",background:"#1a0a0a",border:"1px solid #ef444444",borderRadius:"8px",padding:"20px"}}>
            <div style={{fontSize:"13px",fontWeight:"700",marginBottom:"8px"}}>Failed to load from Notion</div>{error}
          </div>
          <button onClick={onRetry} style={{padding:"8px 20px",borderRadius:"6px",border:"1px solid #3b3b6b",background:"#1a1a2e",color:"#a78bfa",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>Retry</button>
        </>
      ):(
        <>
          <div style={{fontSize:"10px",letterSpacing:"0.2em",color:"#374151",textTransform:"uppercase"}}>Loading from Notion</div>
          <div style={{display:"flex",gap:"6px"}}>
            {[0,1,2].map(i=><div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:"#3b3b6b",animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>)}
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        </>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function GanttApp(){
  const [milestones, setMilestones] = useState([]);
  const [phases,     setPhases]     = useState([]);
  const [categories, setCategories] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [view,       setView]       = useState("dashboard");
  const [search,     setSearch]     = useState("");
  const [filterPhase,setFilterPhase]= useState("All");
  const [hoverId,    setHoverId]    = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdge,setSelectedEdge]=useState(null);
  const [panelSettings, setPanelSettings] = useState(()=>({
    showDate:true, showPriority:true, showStatus:true, showOwner:true,
    showComplexity:true, showNotes:true, showBlockedBy:true, showUnlocks:true,
    ...loadSettings()
  }));
  const isMobile = useIsMobile();

  useEffect(()=>{ saveSettings(panelSettings); },[panelSettings]);

  const loadData = useCallback(async()=>{
    setLoading(true);setLoadError(null);
    try{
      const {milestones:ms,phases:ps,categories:cats}=await loadFromNotion();
      setMilestones(ms);setPhases(ps);setCategories(cats);
    }catch(e){setLoadError(e.message);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{ setSelectedId(null); setSelectedEdge(null); },[filterPhase]);

  useEffect(()=>{
    const h=(e)=>{ if(e.key===" "){e.preventDefault();setSelectedId(null);setSelectedEdge(null);} };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);

  const filtered = useMemo(()=>milestones.filter(m=>{
    const ms=m.name.toLowerCase().includes(search.toLowerCase());
    const mp=filterPhase==="All"||m.category===filterPhase;
    return ms&&mp;
  }),[milestones,search,filterPhase]);

  const chain = useMemo(()=>buildChain(selectedId||hoverId,milestones),[selectedId,hoverId,milestones]);
  const edgeHighlightSet = useMemo(()=>selectedEdge?new Set([selectedEdge.fromId,selectedEdge.toId]):null,[selectedEdge]);
  const selectedMilestone = selectedId?milestones.find(m=>m.id===selectedId):null;
  const effectiveHover = selectedId?null:hoverId;

  const handleTap=(id)=>{ setSelectedEdge(null); setSelectedId(prev=>prev===id?null:id); setHoverId(null); };
  const handleEdgeTap=(fromId,toId)=>{ setSelectedId(null); setSelectedEdge(prev=>prev?.fromId===fromId&&prev?.toId===toId?null:{fromId,toId}); };
  const handleBgClick=()=>{ setSelectedId(null); setSelectedEdge(null); };
  const handleClosePanel=()=>setSelectedId(null);
  const togglePanelSetting=(key)=>setPanelSettings(prev=>({...prev,[key]:!prev[key]}));

  if(loading||loadError)return <LoadingScreen error={loadError} onRetry={loadData}/>;

  const phaseNames=["All",...phases.map(p=>p.name)];

  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",height:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={handleBgClick}>

      <div style={{borderBottom:"1px solid #1e1e2e",padding:isMobile?"10px 14px":"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d0d18",flexShrink:0,zIndex:50}} onClick={e=>e.stopPropagation()}>
        <div>
          <div style={{fontSize:"9px",letterSpacing:"0.15em",color:"#6b7280",textTransform:"uppercase",marginBottom:"1px"}}>Product Roadmap</div>
          <div style={{fontSize:isMobile?"13px":"16px",fontWeight:"700",color:"#f1f5f9",letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:"8px"}}>
            Mar → Sep 2026
            {saving&&<span style={{fontSize:"9px",color:"#6b7280",fontWeight:"400"}}>saving…</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
          <button onClick={loadData} title="Refresh" style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"6px",padding:"5px 9px",color:"#6b7280",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>↺</button>
          <div style={{display:"flex",background:"#1a1a2e",borderRadius:"6px",padding:"2px",border:"1px solid #2d2d4e"}}>
            {[["dashboard","Dashboard"],["gantt","Timeline"],["deps","Dep Map"]].map(([v,label])=>(
              <button key={v} onClick={()=>{setView(v);setSelectedId(null);setSelectedEdge(null);}} style={{padding:isMobile?"4px 7px":"4px 11px",borderRadius:"4px",border:"none",cursor:"pointer",fontSize:isMobile?"9px":"11px",fontFamily:"inherit",fontWeight:v===view?"700":"400",background:v===view?"#3b3b6b":"transparent",color:v===view?"#a78bfa":"#6b7280",whiteSpace:"nowrap"}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {view!=="dashboard"&&(
        <div style={{padding:isMobile?"8px 14px":"8px 24px",borderBottom:"1px solid #1e1e2e",background:"#0d0d18",flexShrink:0}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"4px",color:"#e2e8f0",fontFamily:"inherit",fontSize:"10px",padding:"3px 8px",outline:"none",width:isMobile?"110px":"160px"}}/>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {phaseNames.map(p=>{
                const color=categories[p]||"#a78bfa";
                const active=filterPhase===p;
                return <button key={p} onClick={()=>setFilterPhase(p)} style={{padding:"3px 7px",borderRadius:"4px",border:`1px solid ${active?(p==="All"?"#a78bfa":color):"#2d2d4e"}`,background:active?`${p==="All"?"#a78bfa":color}22`:"transparent",color:active?(p==="All"?"#a78bfa":color):"#6b7280",fontSize:"9px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{p}</button>;
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{flex:1,overflow:"hidden",position:"relative"}}>
        {view==="dashboard"&&<DashboardView milestones={milestones} phases={phases} categories={categories} onSelectTask={handleTap} isMobile={isMobile}/>}
        {view==="gantt"&&<GanttView milestones={filtered} allMilestones={milestones} categories={categories} chain={chain} selectedId={selectedId} hoverId={effectiveHover} isMobile={isMobile} onHover={id=>{if(!selectedId)setHoverId(id);}} onTap={handleTap} onBgClick={handleBgClick}/>}
        {view==="deps"&&<DepsView milestones={filtered} categories={categories} chain={chain} highlightId={selectedId||effectiveHover} isMobile={isMobile} onHover={id=>{if(!selectedId)setHoverId(id);}} onTap={handleTap} selectedId={selectedId} selectedEdge={selectedEdge} edgeHighlightSet={edgeHighlightSet} onEdgeTap={handleEdgeTap} onBgClick={handleBgClick}/>}
      </div>

      {selectedMilestone&&(
        isMobile
          ?<BottomSheet milestone={selectedMilestone} allMilestones={milestones} categories={categories} settings={panelSettings} onToggleSetting={togglePanelSetting} onClose={handleClosePanel} onNavigate={handleTap}/>
          :<SidePanel milestone={selectedMilestone} allMilestones={milestones} categories={categories} settings={panelSettings} onToggleSetting={togglePanelSetting} onClose={handleClosePanel} onNavigate={handleTap}/>
      )}
    </div>
  );
}

// ── Dashboard View ─────────────────────────────────────────────────────────────
function DashboardView({milestones,phases,categories,onSelectTask,isMobile}){
  const [expandedPhase,setExpandedPhase]=useState(null);

  const readyTasks = useMemo(()=>milestones.filter(m=>isReady(m,milestones)),[milestones]);

  const phaseStats = useMemo(()=>phases.map(phase=>{
    const tasks=milestones.filter(m=>m.category===phase.name);
    const done=tasks.filter(m=>m.status==="Done").length;
    const inProg=tasks.filter(m=>m.status==="In Progress").length;
    const blocked=tasks.filter(m=>m.status==="Waiting / Blocked").length;
    const ready=tasks.filter(m=>isReady(m,milestones)).length;
    const p=tasks.length>0?Math.round(done/tasks.length*100):0;
    return{...phase,tasks,done,inProg,blocked,ready,total:tasks.length,pct:p};
  }),[phases,milestones]);

  return(
    <div style={{height:"100%",overflowY:"auto",padding:isMobile?"12px 14px":"18px 28px"}} onClick={e=>e.stopPropagation()}>

      <div style={{marginBottom:"22px"}}>
        <div style={{fontSize:"9px",letterSpacing:"0.15em",textTransform:"uppercase",color:"#6b7280",marginBottom:"10px",fontWeight:"700"}}>Ready to Work On</div>
        {readyTasks.length===0
          ?<div style={{fontSize:"11px",color:"#374151",padding:"14px",background:"#0d0d18",borderRadius:"8px",textAlign:"center"}}>No tasks ready right now</div>
          :<div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(240px,1fr))",gap:"6px"}}>
            {readyTasks.map(m=>{
              const color=categories[m.category]||FB;
              return(
                <div key={m.id} onClick={()=>onSelectTask(m.id)}
                  style={{background:"#0d0d18",border:`1px solid ${color}33`,borderLeft:`3px solid ${color}`,borderRadius:"6px",padding:"9px 11px",cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#131320"}
                  onMouseLeave={e=>e.currentTarget.style.background="#0d0d18"}>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#e2e8f0",marginBottom:"3px",lineHeight:"1.4"}}>{m.name}</div>
                  <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:"9px",color}}>◆ {m.category}</span>
                    {m.date&&<span style={{fontSize:"9px",color:"#6b7280"}}>{fmtDate(m.date)}</span>}
                    {m.priority&&m.priority!=="Medium"&&<span style={{fontSize:"9px",color:PRIORITIES[m.priority]||FB}}>{m.priority}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        }
      </div>

      <div>
        <div style={{fontSize:"9px",letterSpacing:"0.15em",textTransform:"uppercase",color:"#6b7280",marginBottom:"10px",fontWeight:"700"}}>Phases</div>
        <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
          {phaseStats.map(phase=>{
            const isExp=expandedPhase===phase.id;
            return(
              <div key={phase.id} style={{background:"#0d0d18",borderRadius:"8px",border:"1px solid #1e1e2e",overflow:"hidden"}}>
                <div onClick={()=>setExpandedPhase(isExp?null:phase.id)} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{width:"7px",height:"7px",background:phase.color,borderRadius:"1px",transform:"rotate(45deg)",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"4px"}}>
                      <span style={{fontSize:"11px",fontWeight:"600",color:"#e2e8f0"}}>{phase.name}</span>
                      <span style={{fontSize:"10px",color:phase.color,fontWeight:"700"}}>{phase.pct}%</span>
                    </div>
                    <div style={{height:"2px",background:"#1e1e2e",borderRadius:"2px",overflow:"hidden",marginBottom:"4px"}}>
                      <div style={{height:"100%",width:`${phase.pct}%`,background:phase.color,borderRadius:"2px",transition:"width 0.3s"}}/>
                    </div>
                    <div style={{display:"flex",gap:"10px"}}>
                      <span style={{fontSize:"9px",color:"#374151"}}>{phase.done}/{phase.total} done</span>
                      {phase.inProg>0&&<span style={{fontSize:"9px",color:"#3b82f6"}}>↑ {phase.inProg} active</span>}
                      {phase.ready>0&&<span style={{fontSize:"9px",color:"#10b981"}}>✓ {phase.ready} ready</span>}
                      {phase.blocked>0&&<span style={{fontSize:"9px",color:"#f97316"}}>⚠ {phase.blocked} blocked</span>}
                    </div>
                  </div>
                  <span style={{fontSize:"9px",color:"#374151",flexShrink:0}}>{isExp?"▲":"▼"}</span>
                </div>

                {isExp&&(
                  <div style={{borderTop:"1px solid #1e1e2e",padding:"6px 10px",display:"flex",flexDirection:"column",gap:"1px"}}>
                    {phase.tasks.length===0
                      ?<div style={{fontSize:"10px",color:"#374151",padding:"8px",textAlign:"center"}}>No tasks</div>
                      :phase.tasks.map(m=>{
                        const ready=isReady(m,milestones);
                        const isDone=m.status==="Done";
                        const isBlocked=m.status==="Waiting / Blocked";
                        const dimmed=!ready&&!isDone&&!isBlocked;
                        return(
                          <div key={m.id} onClick={()=>onSelectTask(m.id)}
                            style={{display:"flex",alignItems:"center",gap:"7px",padding:"6px 7px",borderRadius:"4px",cursor:"pointer",opacity:dimmed?0.4:1,transition:"background 0.1s"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#1a1a2e"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <div style={{width:"5px",height:"5px",borderRadius:"50%",background:STATUSES[m.status]||FB,flexShrink:0}}/>
                            <span style={{flex:1,fontSize:"10px",color:isDone?"#374151":"#cbd5e1",textDecoration:isDone?"line-through":"none",lineHeight:"1.3"}}>{m.name}</span>
                            <div style={{display:"flex",gap:"4px",flexShrink:0}}>
                              {m.date&&<span style={{fontSize:"9px",color:"#2d3748"}}>{fmtDate(m.date)}</span>}
                              {m.priority==="High"&&<span style={{fontSize:"9px",color:"#ef4444"}}>!</span>}
                              {isBlocked&&<span style={{fontSize:"9px",color:"#f97316"}}>blocked</span>}
                              {ready&&<span style={{fontSize:"9px",color:"#10b981"}}>ready</span>}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Gantt View ─────────────────────────────────────────────────────────────────
function GanttView({milestones,allMilestones,categories,chain,selectedId,hoverId,isMobile,onHover,onTap,onBgClick}){
  const LABEL_W=isMobile?110:200;
  const monthGroups=MONTHS.map(month=>({month,items:milestones.filter(m=>m.month===month)})).filter(g=>g.items.length>0);
  const monthOffsets=MONTHS.map(m=>((MONTH_STARTS[m]-PROJECT_START)/(PROJECT_END-PROJECT_START))*100);
  const highlightId=selectedId||hoverId;

  return(
    <div style={{height:"100%",overflowY:"auto",overflowX:"hidden",padding:isMobile?"10px 14px":"14px 24px"}} onClick={e=>{e.stopPropagation();onBgClick();}}>
      <div style={{position:"relative",height:"18px",marginBottom:"4px",marginLeft:LABEL_W+8}}>
        {MONTHS.map((month,i)=>(
          <div key={month} style={{position:"absolute",left:`${monthOffsets[i]}%`,fontSize:isMobile?"7px":"9px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#2d3748",whiteSpace:"nowrap"}}>
            {month.split(" ")[0]}
          </div>
        ))}
      </div>

      {monthGroups.map(({month,items})=>(
        <div key={month} style={{marginBottom:isMobile?"10px":"14px"}}>
          <div style={{fontSize:"8px",letterSpacing:"0.12em",textTransform:"uppercase",color:"#2d3748",marginBottom:"2px",fontWeight:"700",borderLeft:"2px solid #1e1e2e",paddingLeft:"4px"}}>{month}</div>
          {items.map(m=>{
            const inChain=highlightId?chain.has(m.id):true;
            const isSel=m.id===selectedId;
            const isHov=m.id===hoverId;
            const color=categories[m.category]||FB;
            const x=pct(m.date);
            const sz=isSel?(isMobile?13:11):(isMobile?9:7);
            const rowH=isMobile?26:20;
            return(
              <div key={m.id}
                onMouseEnter={e=>{e.stopPropagation();onHover(m.id);}}
                onMouseLeave={e=>{e.stopPropagation();onHover(null);}}
                onClick={e=>{e.stopPropagation();onTap(m.id);}}
                style={{display:"flex",alignItems:"center",marginBottom:"1px",cursor:"pointer",opacity:highlightId&&!inChain?0.08:1,transition:"opacity 0.15s",minHeight:`${rowH}px`}}>
                <div style={{width:LABEL_W,flexShrink:0,fontSize:isMobile?"9px":"10px",color:isSel?color:(inChain&&highlightId)?"#e2e8f0":"#6b7280",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:"8px",fontWeight:isSel?"700":"400"}}>
                  {m.name}
                </div>
                <div style={{flex:1,position:"relative",height:`${rowH}px`}}>
                  {MONTHS.map((mo,i)=><div key={mo} style={{position:"absolute",left:`${monthOffsets[i]}%`,top:0,bottom:0,width:"1px",background:"#161625"}}/>)}
                  <div style={{position:"absolute",left:`${x}%`,top:"50%",transform:"translate(-50%,-50%) rotate(45deg)",width:sz,height:sz,background:isSel?color:`${color}cc`,boxShadow:isSel?`0 0 14px 3px ${color}77,0 0 4px 1px ${color}`:(isHov?`0 0 7px 2px ${color}44`:"none"),transition:"all 0.15s",zIndex:2}}/>
                  {(isHov||isSel)&&(
                    <div style={{position:"absolute",left:`calc(${x}% + ${sz/2+5}px)`,top:"50%",transform:"translateY(-50%)",fontSize:"9px",color,whiteSpace:"nowrap",pointerEvents:"none",background:"#0a0a0f",padding:"1px 5px",borderRadius:"3px",border:`1px solid ${color}44`,zIndex:3}}>
                      {fmtDate(m.date)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginTop:"14px",paddingTop:"10px",borderTop:"1px solid #1e1e2e"}}>
        {Object.entries(categories).map(([cat,color])=>(
          <div key={cat} style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <div style={{width:"6px",height:"6px",background:color,transform:"rotate(45deg)",flexShrink:0}}/>
            <span style={{fontSize:"9px",color:"#4b5563"}}>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deps View ──────────────────────────────────────────────────────────────────
function DepsView({milestones,categories,chain,highlightId,isMobile,onHover,onTap,selectedId,selectedEdge,edgeHighlightSet,onEdgeTap,onBgClick}){
  const [hoveredEdge,setHoveredEdge]=useState(null);
  const [hoveredNode,setHoveredNode]=useState(null);
  const ids=new Set(milestones.map(m=>m.id));

  const colOf={};
  const assignCol=(id)=>{
    if(colOf[id]!==undefined)return colOf[id];
    const m=milestones.find(x=>x.id===id);
    if(!m)return 0;
    const parentCols=m.blockedBy.filter(d=>ids.has(d)).map(d=>assignCol(d));
    colOf[id]=parentCols.length>0?Math.max(...parentCols)+1:0;
    return colOf[id];
  };
  milestones.forEach(m=>assignCol(m.id));

  const colGroups={};
  milestones.forEach(m=>{
    const c=colOf[m.id]??0;
    if(!colGroups[c])colGroups[c]=[];
    colGroups[c].push(m);
  });
  Object.values(colGroups).forEach(arr=>arr.sort((a,b)=>new Date(a.date)-new Date(b.date)));
  const numCols=Object.keys(colGroups).length||1;

  const NODE_W=isMobile?130:160,NODE_H=isMobile?42:46,ROW_H=isMobile?60:68;
  const CORRIDOR=isMobile?80:100,COL_PITCH=NODE_W+CORRIDOR,PAD_X=20,PAD_Y=20;

  const pos={};
  Object.entries(colGroups).forEach(([ci,arr])=>{
    arr.forEach((m,ri)=>{pos[m.id]={x:parseInt(ci)*COL_PITCH+PAD_X,y:ri*ROW_H+PAD_Y,col:parseInt(ci),row:ri};});
  });

  const edgesByTarget={},edgesBySource={};
  milestones.forEach(m=>{
    m.blockedBy.forEach(depId=>{
      if(!ids.has(depId)||!pos[depId]||!pos[m.id])return;
      if(!edgesByTarget[m.id])edgesByTarget[m.id]=[];
      edgesByTarget[m.id].push(depId);
      if(!edgesBySource[depId])edgesBySource[depId]=[];
      edgesBySource[depId].push(m.id);
    });
  });

  const corridorEdges={};
  milestones.forEach(m=>{
    m.blockedBy.forEach(depId=>{
      if(!ids.has(depId)||!pos[depId])return;
      const ck=pos[depId].col;
      if(!corridorEdges[ck])corridorEdges[ck]=[];
      corridorEdges[ck].push({fromId:depId,toId:m.id});
    });
  });

  const getTrackX=(fromCol,trackIdx,totalTracks)=>{
    const corrLeft=fromCol*COL_PITCH+PAD_X+NODE_W+4;
    const corrRight=(fromCol+1)*COL_PITCH+PAD_X-4;
    const corrW=corrRight-corrLeft;
    if(totalTracks<=1)return corrLeft+corrW/2;
    const step=Math.min(8,(corrW-4)/(totalTracks-1));
    return corrLeft+(corrW-step*(totalTracks-1))/2+trackIdx*step;
  };

  const corridorCounters={};
  const edges=[];
  milestones.forEach(m=>{
    const incomingDeps=edgesByTarget[m.id]||[];
    m.blockedBy.forEach((depId,inIdx)=>{
      if(!ids.has(depId))return;
      const fp=pos[depId],tp=pos[m.id];if(!fp||!tp)return;
      const fromM=milestones.find(x=>x.id===depId);
      const edgeColor=categories[fromM?.category]||FB;
      const ck=fp.col;
      if(!corridorCounters[ck])corridorCounters[ck]=0;
      const trackIdx=corridorCounters[ck]++;
      const totalTracks=corridorEdges[ck]?.length??1;
      const trackX=getTrackX(ck,trackIdx,totalTracks);
      const totalIn=incomingDeps.length;
      const entryFrac=totalIn<=1?0.5:0.2+(inIdx/(totalIn-1))*0.6;
      const outIds=edgesBySource[depId]||[];
      const outIdx=outIds.indexOf(m.id);
      const exitFrac=outIds.length<=1?0.5:0.2+(outIdx/(outIds.length-1))*0.6;
      edges.push({fromId:depId,toId:m.id,color:edgeColor,trackX,
        x1:fp.x+NODE_W,y1:fp.y+exitFrac*NODE_H,
        x2:tp.x,y2:tp.y+entryFrac*NODE_H});
    });
  });

  const maxRow=Object.values(pos).length>0?Math.max(...Object.values(pos).map(p=>p.row)):0;
  const totalW=numCols*COL_PITCH+PAD_X*2+70;
  const totalH=(maxRow+1)*ROW_H+PAD_Y*2;

  const makePath=(x1,y1,x2,y2,tx)=>{
    const R=4,h1=Math.abs(tx-x1),h2=Math.abs(x2-tx),vd=Math.abs(y2-y1);
    const r=Math.min(R,h1/2,h2/2,vd/2);
    if(vd<1)return`M${x1},${y1} L${x2},${y2}`;
    const down=y2>y1,vy1=down?y1+r:y1-r,vy2=down?y2-r:y2+r;
    return[`M${x1},${y1}`,`H${tx-r}`,`Q${tx},${y1} ${tx},${vy1}`,`V${vy2}`,`Q${tx},${y2} ${tx+r},${y2}`,`H${x2}`].join(" ");
  };

  const uniqueColors=[...new Set(edges.map(e=>e.color))];

  return(
    <div style={{height:"100%",overflow:"auto",WebkitOverflowScrolling:"touch"}} onClick={e=>{e.stopPropagation();onBgClick();}}>
      <svg width={totalW} height={totalH} style={{display:"block",touchAction:"pan-x pan-y"}}>
        <defs>
          <filter id="eg" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="ng" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {uniqueColors.map(c=>{
            const s=c.replace("#","");
            return(
              <g key={c}>
                <marker id={`a-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c}/></marker>
                <marker id={`ad-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c} fillOpacity="0.15"/></marker>
              </g>
            );
          })}
        </defs>

        <g>
          {edges.map(e=>{
            const ek=`${e.fromId}-${e.toId}`;
            const isSel=selectedEdge?.fromId===e.fromId&&selectedEdge?.toId===e.toId;
            const isHov=hoveredEdge?.fromId===e.fromId&&hoveredEdge?.toId===e.toId;
            const isNodeActive=highlightId?(chain.has(e.toId)&&chain.has(e.fromId)):false;
            const isEdgeActive=edgeHighlightSet?(edgeHighlightSet.has(e.fromId)&&edgeHighlightSet.has(e.toId)):false;
            const isActive=isSel||isEdgeActive||isNodeActive||isHov;
            const anythingActive=!!(highlightId||selectedEdge);
            const isInactive=anythingActive&&!isActive;
            const safeId=e.color.replace("#","");
            const d=makePath(e.x1,e.y1,e.x2,e.y2,e.trackX);
            const sw=isSel?3.5:isHov?2.5:isActive?2:1.2;
            return(
              <g key={ek} style={{cursor:"pointer"}}
                onMouseEnter={ev=>{ev.stopPropagation();setHoveredEdge({fromId:e.fromId,toId:e.toId});}}
                onMouseLeave={()=>setHoveredEdge(null)}
                onClick={ev=>{ev.stopPropagation();onEdgeTap(e.fromId,e.toId);}}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={16}/>
                <path d={d} fill="none" stroke={e.color} strokeWidth={sw}
                  filter={isSel||isHov?"url(#eg)":undefined}
                  markerEnd={isInactive?`url(#ad-${safeId})`:`url(#a-${safeId})`}
                  opacity={isInactive?0.07:isActive?1:0.35}
                  style={{transition:"opacity 0.12s,stroke-width 0.12s"}}/>
              </g>
            );
          })}
        </g>

        <g>
          {milestones.map(m=>{
            const p=pos[m.id];if(!p)return null;
            const color=categories[m.category]||FB;
            const inChain=highlightId?chain.has(m.id):true;
            const isSel=m.id===selectedId;
            const isHov=m.id===hoveredNode;
            const isEdgeEP=!!(edgeHighlightSet?.has(m.id))||!!(hoveredEdge&&(hoveredEdge.fromId===m.id||hoveredEdge.toId===m.id));
            const isFrom=selectedEdge?.fromId===m.id||hoveredEdge?.fromId===m.id;
            const isTo=selectedEdge?.toId===m.id||hoveredEdge?.toId===m.id;
            const anythingActive=!!(highlightId||selectedEdge||hoveredEdge);
            const effectivelyActive=isSel||inChain||isEdgeEP;
            const shouldDim=anythingActive&&!effectivelyActive;
            const maxC=isMobile?16:19;
            const tName=m.name.length>maxC?m.name.slice(0,maxC-1)+"…":m.name;
            const maxCC=isMobile?17:21;
            const tCat=m.category.length>maxCC?m.category.slice(0,maxCC-1)+"…":m.category;
            return(
              <g key={m.id} transform={`translate(${p.x},${p.y})`}
                onMouseEnter={ev=>{ev.stopPropagation();onHover(m.id);setHoveredNode(m.id);}}
                onMouseLeave={()=>{onHover(null);setHoveredNode(null);}}
                onClick={ev=>{ev.stopPropagation();onTap(m.id);}}
                style={{cursor:"pointer"}}>
                <rect width={NODE_W} height={NODE_H} rx={5} fill="#0a0a0f"/>
                <rect width={NODE_W} height={NODE_H} rx={5}
                  fill={isSel||isEdgeEP?`${color}22`:"#0e0e1a"}
                  stroke={isSel?color:isTo?color:isFrom?color+"99":isHov?"#4d4d7a":"#2d2d50"}
                  strokeWidth={isSel?2:isEdgeEP?2:isHov?1.5:1}
                  filter={isSel||isEdgeEP?"url(#ng)":undefined}
                  opacity={shouldDim?0.18:1} style={{transition:"opacity 0.12s"}}/>
                <rect width={3} height={NODE_H} rx={2} fill={color} opacity={shouldDim?0.1:1}/>
                <text x={11} y={isMobile?17:18} fill={shouldDim?"#252535":"#dde4f0"} fontSize={isMobile?9:10} fontFamily="DM Mono,monospace" fontWeight={isSel||isEdgeEP?"700":"400"} opacity={shouldDim?0.18:1}>{tName}</text>
                <text x={11} y={isMobile?30:33} fill={color} fontSize={isMobile?7.5:8.5} fontFamily="DM Mono,monospace" opacity={shouldDim?0.08:0.7}>{tCat}</text>
                {(isHov||isSel)&&!shouldDim&&(
                  <g transform={`translate(${NODE_W+6},${NODE_H/2-8})`}>
                    <rect x={0} y={0} width={52} height={16} rx={3} fill="#0d0d18" stroke={`${color}55`} strokeWidth={1}/>
                    <text x={26} y={11} fill={color} fontSize={8} fontFamily="DM Mono,monospace" textAnchor="middle">{fmtDate(m.date)}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── Panel Settings Bar ─────────────────────────────────────────────────────────
function PanelSettingsBar({settings,onToggle}){
  const fields=[["showDate","Date"],["showPriority","Priority"],["showStatus","Status"],["showOwner","Owner"],["showComplexity","Complexity"],["showNotes","Notes"],["showBlockedBy","Blocked By"],["showUnlocks","Unlocks"]];
  return(
    <div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginBottom:"12px",paddingBottom:"10px",borderBottom:"1px solid #1e1e2e"}}>
      {fields.map(([key,label])=>(
        <button key={key} onClick={()=>onToggle(key)} style={{padding:"2px 6px",borderRadius:"3px",border:`1px solid ${settings[key]?"#3b3b6b":"#1e1e2e"}`,background:settings[key]?"#3b3b6b22":"transparent",color:settings[key]?"#a78bfa":"#374151",fontSize:"9px",cursor:"pointer",fontFamily:"inherit"}}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Detail Content ─────────────────────────────────────────────────────────────
function Detail({milestone,allMilestones,categories,settings,onToggleSetting,onClose,onNavigate}){
  const color=categories[milestone.category]||FB;
  const priColor=PRIORITIES[milestone.priority]||FB;
  const statColor=STATUSES[milestone.status]||"#374151";
  const blockedByMs=(milestone.blockedBy||[]).map(id=>allMilestones.find(m=>m.id===id)).filter(Boolean);
  const unlocks=allMilestones.filter(m=>(m.blockedBy||[]).includes(milestone.id));
  const ready=isReady(milestone,allMilestones);

  const Chip=({label,col})=>(
    <span style={{display:"inline-block",padding:"2px 7px",borderRadius:"3px",background:`${col}22`,border:`1px solid ${col}55`,fontSize:"9px",color:col,marginRight:"4px",marginBottom:"4px"}}>{label}</span>
  );

  return(
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
        <div style={{fontSize:"9px",letterSpacing:"0.1em",textTransform:"uppercase",color,fontWeight:"700"}}>{milestone.category}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"18px",padding:"0",lineHeight:1}}>✕</button>
      </div>
      <div style={{fontSize:"14px",fontWeight:"700",color:"#f1f5f9",marginBottom:"4px",lineHeight:"1.4"}}>{milestone.name}</div>
      {ready&&<div style={{fontSize:"9px",color:"#10b981",marginBottom:"8px"}}>✓ Ready to work on</div>}

      <PanelSettingsBar settings={settings} onToggle={onToggleSetting}/>

      <div style={{display:"flex",flexWrap:"wrap",marginBottom:"8px"}}>
        {settings.showDate&&milestone.date&&<Chip label={fmtDateLong(milestone.date)} col="#6b7280"/>}
        {settings.showPriority&&milestone.priority&&<Chip label={milestone.priority} col={priColor}/>}
        {settings.showStatus&&milestone.status&&<Chip label={milestone.status} col={statColor}/>}
        {settings.showComplexity&&milestone.effort!=null&&<Chip label={`Complexity: ${milestone.effort}`} col="#4b5563"/>}
        {settings.showOwner&&milestone.owner&&<Chip label={milestone.owner} col="#6b7280"/>}
      </div>

      {milestone.description&&(
        <div style={{fontSize:"11px",color:"#94a3b8",lineHeight:"1.8",marginBottom:"12px"}}>{milestone.description}</div>
      )}

      {settings.showNotes&&milestone.notes&&(
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"9px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#6b7280",marginBottom:"4px"}}>Notes</div>
          <div style={{fontSize:"11px",color:"#cbd5e1",lineHeight:"1.8",background:"#1a1a2e",borderRadius:"5px",padding:"8px 10px",borderLeft:"2px solid #a78bfa",whiteSpace:"pre-wrap"}}>{milestone.notes}</div>
        </div>
      )}

      {settings.showBlockedBy&&blockedByMs.length>0&&(
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"9px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#6b7280",marginBottom:"5px"}}>Blocked By</div>
          {blockedByMs.map(dep=>(
            <div key={dep.id} onClick={()=>onNavigate(dep.id)} style={{padding:"6px 9px",marginBottom:"3px",background:"#1a1a2e",borderRadius:"5px",fontSize:"11px",color:"#a78bfa",cursor:"pointer",borderLeft:`2px solid ${categories[dep.category]||FB}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{dep.name}</span>
              <span style={{fontSize:"9px",color:STATUSES[dep.status]||"#374151",flexShrink:0,marginLeft:"8px"}}>{dep.status}</span>
            </div>
          ))}
        </div>
      )}

      {settings.showUnlocks&&unlocks.length>0&&(
        <div>
          <div style={{fontSize:"9px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#6b7280",marginBottom:"5px"}}>Unlocks</div>
          {unlocks.map(m=>(
            <div key={m.id} onClick={()=>onNavigate(m.id)} style={{padding:"6px 9px",marginBottom:"3px",background:"#1a1a2e",borderRadius:"5px",fontSize:"11px",color:"#6ee7b7",cursor:"pointer",borderLeft:`2px solid ${categories[m.category]||FB}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{m.name}</span>
              <span style={{fontSize:"9px",color:STATUSES[m.status]||"#374151",flexShrink:0,marginLeft:"8px"}}>{m.status}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Side Panel ─────────────────────────────────────────────────────────────────
function SidePanel({milestone,allMilestones,categories,settings,onToggleSetting,onClose,onNavigate}){
  return(
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:"300px",borderLeft:"1px solid #1e1e2e",padding:"18px",background:"#0d0d18",overflowY:"auto",zIndex:100}} onClick={e=>e.stopPropagation()}>
      <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} settings={settings} onToggleSetting={onToggleSetting} onClose={onClose} onNavigate={onNavigate}/>
    </div>
  );
}

// ── Bottom Sheet ───────────────────────────────────────────────────────────────
function BottomSheet({milestone,allMilestones,categories,settings,onToggleSetting,onClose,onNavigate}){
  return(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000088",zIndex:90}}/>
      <div style={{position:"fixed",left:0,right:0,bottom:0,background:"#0d0d18",borderTop:"1px solid #2d2d4e",borderRadius:"14px 14px 0 0",padding:"14px 18px 40px",zIndex:100,maxHeight:"82vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:"36px",height:"3px",background:"#2d2d4e",borderRadius:"2px",margin:"0 auto 12px"}}/>
        <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} settings={settings} onToggleSetting={onToggleSetting} onClose={onClose} onNavigate={onNavigate}/>
      </div>
    </>
  );
}
