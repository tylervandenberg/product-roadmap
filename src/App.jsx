import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { loadFromNotion, updateTask, updateDependencies, updateLinkedPhase } from "./notion.js";

const PRIORITIES = { High:"#ef4444", Medium:"#f59e0b", Low:"#6b7280" };
const STATUSES   = { "Not Started":"#4b5563","In Progress":"#3b82f6","Waiting / Blocked":"#f97316","Done":"#10b981" };
const MONTHS = ["March 2026","April 2026","May 2026","June 2026","July 2026","August 2026","September 2026"];
const MONTH_STARTS = {"March 2026":new Date("2026-03-01"),"April 2026":new Date("2026-04-01"),"May 2026":new Date("2026-05-01"),"June 2026":new Date("2026-06-01"),"July 2026":new Date("2026-07-01"),"August 2026":new Date("2026-08-01"),"September 2026":new Date("2026-09-01")};
const PROJECT_START = new Date("2026-03-01");
const PROJECT_END   = new Date("2026-09-30");
const FB = "#6b7280";
const SETTINGS_KEY = "roadmap_panel_filters_v2";
const DEP_RED   = "#ef4444";
const DEP_GREEN = "#22c55e";

const LAUNCH_READINESS_COLOR = "#f59e0b"; // override gray for Launch Readiness

function getCategoryColor(cat, categories){
  const c = categories[cat];
  if(cat === "Launch Readiness" && (!c || c === "#6b7280" || c === FB)) return LAUNCH_READINESS_COLOR;
  return c || FB;
}
function fmtDate(d){if(!d)return"";return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function fmtDateLong(d){if(!d)return"No date";return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});}

function isReady(m,all){
  if(m.status==="Done")return false;
  if(!m.blockedBy||m.blockedBy.length===0)return true;
  return m.blockedBy.every(id=>{const d=all.find(x=>x.id===id);return!d||d.status==="Done";});
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

function loadSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");}catch{return{};}}
function saveSettings(s){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}catch{}}

// ── Loading Screen ─────────────────────────────────────────────────────────────
function LoadingScreen({error,onRetry}){
  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px"}}>
      {error?(
        <>
          <div style={{fontSize:"13px",color:"#ef4444",maxWidth:"400px",textAlign:"center",lineHeight:"1.8",background:"#1a0a0a",border:"1px solid #ef444444",borderRadius:"8px",padding:"20px"}}>
            <div style={{fontSize:"15px",fontWeight:"700",marginBottom:"8px"}}>Failed to load from Notion</div>{error}
          </div>
          <button onClick={onRetry} style={{padding:"10px 24px",borderRadius:"6px",border:"1px solid #3b3b6b",background:"#1a1a2e",color:"#a78bfa",cursor:"pointer",fontSize:"13px",fontFamily:"inherit"}}>Retry</button>
        </>
      ):(
        <>
          <div style={{fontSize:"12px",letterSpacing:"0.2em",color:"#374151",textTransform:"uppercase"}}>Loading from Notion</div>
          <div style={{display:"flex",gap:"8px"}}>
            {[0,1,2].map(i=><div key={i} style={{width:"8px",height:"8px",borderRadius:"50%",background:"#3b3b6b",animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>)}
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        </>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function GanttApp(){
  const [milestones,setMilestones]=useState([]);
  const [phases,setPhases]=useState([]);
  const [categories,setCategories]=useState({});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(null);
  const [saving,setSaving]=useState(false);
  const [view,setView]=useState("dashboard");
  const [search,setSearch]=useState("");
  const [filterPhase,setFilterPhase]=useState("All");
  const [hoverId,setHoverId]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  const [selectedEdge,setSelectedEdge]=useState(null);
  const [panelOpen,setPanelOpen]=useState(false);
  const [panelSettings,setPanelSettings]=useState(()=>({
    showDate:true,showPriority:true,showStatus:true,showOwner:true,
    showComplexity:true,showNotes:true,showBlockedBy:true,showUnlocks:true,
    ...loadSettings()
  }));
  const isMobile=useIsMobile();

  useEffect(()=>{saveSettings(panelSettings);},[panelSettings]);

  const loadData=useCallback(async()=>{
    setLoading(true);setLoadError(null);
    try{
      const {milestones:ms,phases:ps,categories:cats}=await loadFromNotion();
      // Override Launch Readiness if it's gray or missing
      if(cats["Launch Readiness"]&&(cats["Launch Readiness"]==="#6b7280"||cats["Launch Readiness"]===FB)){
        cats["Launch Readiness"]="#f59e0b";
      }
      if(!cats["Launch Readiness"])cats["Launch Readiness"]="#f59e0b";
      // Also fix any phases
      ps.forEach(p=>{if(p.name==="Launch Readiness"&&(p.color==="#6b7280"||p.color===FB||!p.color))p.color="#f59e0b";});
      setMilestones(ms);setPhases(ps);setCategories(cats);
    }catch(e){setLoadError(e.message);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{setSelectedId(null);setSelectedEdge(null);setPanelOpen(false);},[filterPhase]);

  useEffect(()=>{
    const h=(e)=>{if(e.key===" "){e.preventDefault();setSelectedId(null);setSelectedEdge(null);setPanelOpen(false);}};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);

  const filtered=useMemo(()=>milestones.filter(m=>{
    const ms=m.name.toLowerCase().includes(search.toLowerCase());
    const mp=filterPhase==="All"||m.category===filterPhase;
    return ms&&mp;
  }),[milestones,search,filterPhase]);

  const chain=useMemo(()=>buildChain(selectedId||hoverId,milestones),[selectedId,hoverId,milestones]);
  // Direct connections only (for timeline highlight - no transitive)
  const directChain=useMemo(()=>{
    const id=selectedId||hoverId;
    if(!id)return new Set();
    const s=new Set([id]);
    const m=milestones.find(x=>x.id===id);
    if(m)(m.blockedBy||[]).forEach(d=>s.add(d));
    milestones.forEach(x=>{if((x.blockedBy||[]).includes(id))s.add(x.id);});
    return s;
  },[selectedId,hoverId,milestones]);
  const edgeHighlightSet=useMemo(()=>selectedEdge?new Set([selectedEdge.fromId,selectedEdge.toId]):null,[selectedEdge]);
  const selectedMilestone=selectedId?milestones.find(m=>m.id===selectedId):null;
  const effectiveHover=selectedId?null:hoverId;

  const handleTap=(id)=>{
    setSelectedEdge(null);
    const same=selectedId===id;
    setSelectedId(same?null:id);
    setPanelOpen(!same);
    setHoverId(null);
  };
  const handleEdgeTap=(fromId,toId)=>{
    setSelectedId(null);
    setPanelOpen(false);
    setSelectedEdge(prev=>prev?.fromId===fromId&&prev?.toId===toId?null:{fromId,toId});
  };
  const handleClosePanel=()=>setPanelOpen(false);
  const handleBgClick=()=>{setSelectedId(null);setSelectedEdge(null);setPanelOpen(false);};
  const togglePanelSetting=(key)=>setPanelSettings(prev=>({...prev,[key]:!prev[key]}));

  if(loading||loadError)return <LoadingScreen error={loadError} onRetry={loadData}/>;

  const phaseNames=["All",...phases.map(p=>p.name)];
  const showPanel=panelOpen&&selectedMilestone;

  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",height:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={handleBgClick}>

      {/* Header */}
      <div style={{borderBottom:"1px solid #1e1e2e",padding:isMobile?"12px 16px":"16px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d0d18",flexShrink:0,zIndex:50}} onClick={e=>e.stopPropagation()}>
        <div>
          <div style={{fontSize:"11px",letterSpacing:"0.15em",color:"#6b7280",textTransform:"uppercase",marginBottom:"2px"}}>Product Roadmap</div>
          <div style={{fontSize:isMobile?"17px":"20px",fontWeight:"700",color:"#f1f5f9",letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:"10px"}}>
            Mar → Sep 2026
            {saving&&<span style={{fontSize:"11px",color:"#6b7280",fontWeight:"400"}}>saving…</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
          <button onClick={loadData} title="Refresh" style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"6px",padding:"6px 11px",color:"#6b7280",cursor:"pointer",fontSize:"13px",fontFamily:"inherit"}}>↺</button>
          <div style={{display:"flex",background:"#1a1a2e",borderRadius:"6px",padding:"2px",border:"1px solid #2d2d4e"}}>
            {[["dashboard","Dashboard"],["gantt","Timeline"],["ganttbar","Gantt"],["deps","Dep Map"]].map(([v,label])=>(
              <button key={v} onClick={()=>{setView(v);setSelectedId(null);setSelectedEdge(null);setPanelOpen(false);}} style={{padding:isMobile?"5px 9px":"5px 13px",borderRadius:"4px",border:"none",cursor:"pointer",fontSize:isMobile?"11px":"12px",fontFamily:"inherit",fontWeight:v===view?"700":"400",background:v===view?"#3b3b6b":"transparent",color:v===view?"#a78bfa":"#6b7280",whiteSpace:"nowrap"}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      {view!=="dashboard"&&(
        <div style={{padding:isMobile?"10px 16px":"10px 28px",borderBottom:"1px solid #1e1e2e",background:"#0d0d18",flexShrink:0}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"4px",color:"#e2e8f0",fontFamily:"inherit",fontSize:"12px",padding:"4px 10px",outline:"none",width:isMobile?"130px":"180px"}}/>
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
              {phaseNames.map(p=>{
                const color=categories[p]||"#a78bfa";
                const active=filterPhase===p;
                return <button key={p} onClick={()=>setFilterPhase(p)} style={{padding:"4px 9px",borderRadius:"4px",border:`1px solid ${active?(p==="All"?"#a78bfa":color):"#2d2d4e"}`,background:active?`${p==="All"?"#a78bfa":color}22`:"transparent",color:active?(p==="All"?"#a78bfa":color):"#6b7280",fontSize:"11px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{p}</button>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{flex:1,overflow:"hidden",position:"relative"}}>
        {view==="dashboard"&&<DashboardView milestones={milestones} phases={phases} categories={categories} onSelectTask={handleTap} isMobile={isMobile}/>}
        {view==="gantt"&&<GanttView milestones={filtered} allMilestones={milestones} categories={categories} chain={chain} directChain={directChain} selectedId={selectedId} hoverId={effectiveHover} isMobile={isMobile} onHover={id=>{if(!selectedId)setHoverId(id);}} onTap={handleTap} onBgClick={handleBgClick}/>}
        {view==="ganttbar"&&<GanttBarView milestones={filtered} allMilestones={milestones} categories={categories} chain={chain} directChain={directChain} selectedId={selectedId} hoverId={effectiveHover} isMobile={isMobile} onHover={id=>{if(!selectedId)setHoverId(id);}} onTap={handleTap} onBgClick={handleBgClick}/>}
        {view==="deps"&&<DepsView milestones={filtered} categories={categories} chain={chain} highlightId={selectedId||effectiveHover} isMobile={isMobile} onHover={id=>{if(!selectedId)setHoverId(id);}} onTap={handleTap} selectedId={selectedId} selectedEdge={selectedEdge} edgeHighlightSet={edgeHighlightSet} onEdgeTap={handleEdgeTap} onBgClick={handleBgClick}/>}
      </div>

      {/* Detail panel — separate from selection state */}
      {showPanel&&(
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
  const readyTasks=useMemo(()=>milestones.filter(m=>isReady(m,milestones)),[milestones]);
  const phaseStats=useMemo(()=>phases.map(phase=>{
    const tasks=milestones.filter(m=>m.category===phase.name);
    const done=tasks.filter(m=>m.status==="Done").length;
    const inProg=tasks.filter(m=>m.status==="In Progress").length;
    const blocked=tasks.filter(m=>m.status==="Waiting / Blocked").length;
    const ready=tasks.filter(m=>isReady(m,milestones)).length;
    const p=tasks.length>0?Math.round(done/tasks.length*100):0;
    return{...phase,tasks,done,inProg,blocked,ready,total:tasks.length,pct:p};
  }),[phases,milestones]);

  return(
    <div style={{height:"100%",overflowY:"auto",padding:isMobile?"14px 16px 80px":"20px 28px 80px"}} onClick={e=>e.stopPropagation()}>
      <div style={{marginBottom:"26px"}}>
        <div style={{fontSize:"12px",letterSpacing:"0.15em",textTransform:"uppercase",color:"#6b7280",marginBottom:"12px",fontWeight:"700"}}>Ready to Work On</div>
        {readyTasks.length===0
          ?<div style={{fontSize:"13px",color:"#4b5563",padding:"18px",background:"#0d0d18",borderRadius:"8px",textAlign:"center"}}>No tasks ready right now</div>
          :<div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(260px,1fr))",gap:"8px"}}>
            {readyTasks.map(m=>{
              const color=categories[m.category]||FB;
              return(
                <div key={m.id} onClick={()=>onSelectTask(m.id)}
                  style={{background:"#0d0d18",border:`1px solid ${color}33`,borderLeft:`3px solid ${color}`,borderRadius:"7px",padding:"12px 14px",cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#131320"}
                  onMouseLeave={e=>e.currentTarget.style.background="#0d0d18"}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:"#e2e8f0",marginBottom:"5px",lineHeight:"1.4"}}>{m.name}</div>
                  <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:"11px",color}}>◆ {m.category}</span>
                    {m.date&&<span style={{fontSize:"11px",color:"#94a3b8"}}>{fmtDate(m.date)}</span>}
                    {m.priority&&m.priority!=="Medium"&&<span style={{fontSize:"11px",color:PRIORITIES[m.priority]||FB}}>{m.priority}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        }
      </div>

      <div>
        <div style={{fontSize:"12px",letterSpacing:"0.15em",textTransform:"uppercase",color:"#6b7280",marginBottom:"12px",fontWeight:"700"}}>Phases</div>
        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
          {phaseStats.map(phase=>{
            const isExp=expandedPhase===phase.id;
            return(
              <div key={phase.id} style={{background:"#0d0d18",borderRadius:"8px",border:"1px solid #1e1e2e",overflow:"hidden"}}>
                <div onClick={()=>setExpandedPhase(isExp?null:phase.id)} style={{padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"12px"}}>
                  <div style={{width:"9px",height:"9px",background:phase.color,borderRadius:"2px",transform:"rotate(45deg)",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"5px"}}>
                      <span style={{fontSize:"13px",fontWeight:"600",color:"#e2e8f0"}}>{phase.name}</span>
                      <span style={{fontSize:"12px",color:phase.color,fontWeight:"700"}}>{phase.pct}%</span>
                    </div>
                    <div style={{height:"3px",background:"#1e1e2e",borderRadius:"2px",overflow:"hidden",marginBottom:"5px"}}>
                      <div style={{height:"100%",width:`${phase.pct}%`,background:phase.color,borderRadius:"2px",transition:"width 0.3s"}}/>
                    </div>
                    <div style={{display:"flex",gap:"12px"}}>
                      <span style={{fontSize:"11px",color:"#4b5563"}}>{phase.done}/{phase.total} done</span>
                      {phase.inProg>0&&<span style={{fontSize:"11px",color:"#3b82f6"}}>↑ {phase.inProg} active</span>}
                      {phase.ready>0&&<span style={{fontSize:"11px",color:"#10b981"}}>✓ {phase.ready} ready</span>}
                      {phase.blocked>0&&<span style={{fontSize:"11px",color:"#f97316"}}>⚠ {phase.blocked} blocked</span>}
                    </div>
                  </div>
                  <span style={{fontSize:"11px",color:"#4b5563",flexShrink:0}}>{isExp?"▲":"▼"}</span>
                </div>
                {isExp&&(
                  <div style={{borderTop:"1px solid #1e1e2e",padding:"8px 12px",display:"flex",flexDirection:"column",gap:"2px"}}>
                    {phase.tasks.length===0
                      ?<div style={{fontSize:"12px",color:"#4b5563",padding:"10px",textAlign:"center"}}>No tasks</div>
                      :phase.tasks.map(m=>{
                        const ready=isReady(m,milestones);
                        const isDone=m.status==="Done";
                        const isBlocked=m.status==="Waiting / Blocked";
                        const dimmed=!ready&&!isDone&&!isBlocked;
                        return(
                          <div key={m.id} onClick={()=>onSelectTask(m.id)}
                            style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px",borderRadius:"5px",cursor:"pointer",opacity:dimmed?0.4:1,transition:"background 0.1s"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#1a1a2e"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:STATUSES[m.status]||FB,flexShrink:0}}/>
                            <span style={{flex:1,fontSize:"12px",color:isDone?"#4b5563":"#cbd5e1",textDecoration:isDone?"line-through":"none",lineHeight:"1.4"}}>{m.name}</span>
                            <div style={{display:"flex",gap:"5px",flexShrink:0}}>
                              {m.date&&<span style={{fontSize:"11px",color:"#94a3b8"}}>{fmtDate(m.date)}</span>}
                              {m.priority==="High"&&<span style={{fontSize:"11px",color:"#ef4444"}}>!</span>}
                              {isBlocked&&<span style={{fontSize:"11px",color:"#f97316"}}>blocked</span>}
                              {ready&&<span style={{fontSize:"11px",color:"#10b981"}}>ready</span>}
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
function getMonthLabel(dateStr){
  if(!dateStr)return null;
  const d=new Date(dateStr+"T12:00:00");
  return d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
}

function GanttView({milestones,allMilestones,categories,chain,directChain,selectedId,hoverId,isMobile,onHover,onTap,onBgClick}){
  const LABEL_W=isMobile?130:220;
  const ROW_H=isMobile?32:28;
  const monthGroups=MONTHS.map(month=>({month,items:milestones.filter(m=>getMonthLabel(m.date)===month)})).filter(g=>g.items.length>0);
  const monthOffsets=MONTHS.map(m=>((MONTH_STARTS[m]-PROJECT_START)/(PROJECT_END-PROJECT_START))*100);
  const highlightId=selectedId||hoverId;
  const containerRef=useRef(null);
  const rowRefs=useRef({});

  const activeId=highlightId;
  const depLines=useMemo(()=>{
    if(!activeId)return[];
    const m=milestones.find(x=>x.id===activeId);
    if(!m)return[];
    const filteredIds=new Set(milestones.map(x=>x.id));
    const lines=[];
    (m.blockedBy||[]).forEach(depId=>{
      if(filteredIds.has(depId))lines.push({fromId:depId,toId:activeId,type:"blockedBy"});
    });
    milestones.forEach(x=>{
      if((x.blockedBy||[]).includes(activeId)&&filteredIds.has(x.id))
        lines.push({fromId:activeId,toId:x.id,type:"unlocks"});
    });
    return lines;
  },[activeId,milestones]);

  const [hoveredLine,setHoveredLine]=useState(null);
  const [selectedLine,setSelectedLine]=useState(null);
  useEffect(()=>{setSelectedLine(null);},[activeId]);

  return(
    <div style={{height:"100%",overflowY:"auto",overflowX:"hidden",padding:isMobile?"12px 16px 80px":"16px 28px 80px",position:"relative"}} onClick={e=>{e.stopPropagation();onBgClick();}}>
      {/* Month headers */}
      <div style={{position:"sticky",top:0,background:"#0a0a0f",zIndex:10,paddingBottom:"4px"}}>
        <div style={{position:"relative",height:"22px",marginLeft:LABEL_W+8}}>
          {MONTHS.map((month,i)=>(
            <div key={month} style={{position:"absolute",left:`${monthOffsets[i]}%`,fontSize:isMobile?"10px":"11px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#374151",whiteSpace:"nowrap"}}>
              {month.split(" ")[0]}
            </div>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} style={{position:"relative"}}>
        {depLines.length>0&&(
          <GanttDepLines lines={depLines} milestones={milestones} rowRefs={rowRefs} containerRef={containerRef} LABEL_W={LABEL_W} ROW_H={ROW_H} hoveredLine={hoveredLine} setHoveredLine={setHoveredLine} selectedLine={selectedLine} setSelectedLine={setSelectedLine}/>
        )}

        {monthGroups.map(({month,items})=>(
          <div key={month} style={{marginBottom:isMobile?"14px":"18px"}}>
            <div style={{fontSize:"10px",letterSpacing:"0.12em",textTransform:"uppercase",color:"#2d3748",marginBottom:"3px",fontWeight:"700",borderLeft:"2px solid #1e1e2e",paddingLeft:"5px"}}>{month}</div>
            {items.map(m=>{
              const inChain=highlightId?chain.has(m.id):true;
              const inDirect=highlightId?directChain.has(m.id):true;
              const isSel=m.id===selectedId;
              const isHov=m.id===hoverId;
              const color=categories[m.category]||FB;
              const x=pct(m.date);
              const sz=isSel?(isMobile?16:14):(isMobile?11:9);
              return(
                <div key={m.id}
                  ref={el=>{if(el)rowRefs.current[m.id]=el;}}
                  onClick={e=>{e.stopPropagation();onTap(m.id);}}
                  style={{display:"flex",alignItems:"center",marginBottom:"3px",cursor:"pointer",opacity:highlightId&&!inDirect?0.08:1,transition:"opacity 0.15s",minHeight:`${ROW_H}px`}}>
                  <div
                    onMouseEnter={e=>{e.stopPropagation();onHover(m.id);}}
                    onMouseLeave={e=>{e.stopPropagation();onHover(null);}}
                    style={{width:LABEL_W,flexShrink:0,fontSize:isMobile?"12px":"13px",color:isSel?color:(inDirect&&highlightId)?"#e2e8f0":"#6b7280",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:"10px",fontWeight:isSel?"700":"400"}}>
                    {m.name}
                  </div>
                  <div
                    onMouseEnter={selectedId?e=>{e.stopPropagation();onHover(m.id);}:undefined}
                    onMouseLeave={selectedId?e=>{e.stopPropagation();onHover(null);}:undefined}
                    style={{flex:1,position:"relative",height:`${ROW_H}px`}}>
                    {MONTHS.map((mo,i)=><div key={mo} style={{position:"absolute",left:`${monthOffsets[i]}%`,top:0,bottom:0,width:"1px",background:"#161625"}}/>)}
                    <div style={{position:"absolute",left:`${x}%`,top:"50%",transform:"translate(-50%,-50%) rotate(45deg)",width:sz,height:sz,background:isSel?color:`${color}cc`,boxShadow:isSel?`0 0 16px 4px ${color}77,0 0 5px 1px ${color}`:(isHov?`0 0 9px 2px ${color}55`:"none"),transition:"all 0.15s",zIndex:2}}/>
                    {(isHov||isSel||(selectedId&&inDirect&&!isSel))&&(
                      <div style={{position:"absolute",left:`calc(${x}% + ${sz/2+7}px)`,top:"50%",transform:"translateY(-50%)",fontSize:"11px",color:(isHov||isSel)?color:"#94a3b8",whiteSpace:"nowrap",pointerEvents:"none",background:"#0a0a0f",padding:"2px 6px",borderRadius:"3px",border:`1px solid ${(isHov||isSel)?color+"44":"#2d2d4e"}`,zIndex:3}}>
                        {fmtDate(m.date)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginTop:"16px",paddingTop:"12px",borderTop:"1px solid #1e1e2e"}}>
        {Object.entries(categories).map(([cat,color])=>(
          <div key={cat} style={{display:"flex",alignItems:"center",gap:"5px"}}>
            <div style={{width:"7px",height:"7px",background:color,transform:"rotate(45deg)",flexShrink:0}}/>
            <span style={{fontSize:"11px",color:"#4b5563"}}>{cat}</span>
          </div>
        ))}
      </div>

      {/* Line label tooltip */}
      {(hoveredLine||selectedLine)&&(()=>{
        const line=selectedLine||hoveredLine;
        const fromM=milestones.find(x=>x.id===line.fromId);
        const toM=milestones.find(x=>x.id===line.toId);
        if(!fromM||!toM)return null;
        const label=line.type==="blockedBy"?`${toM.name} blocked by ${fromM.name}`:`${fromM.name} unlocks ${toM.name}`;
        const col=line.type==="blockedBy"?DEP_RED:DEP_GREEN;
        return(
          <div style={{position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",background:"#0d0d18",border:`1px solid ${col}66`,borderRadius:"6px",padding:"8px 16px",fontSize:"12px",color:col,zIndex:200,pointerEvents:"none",maxWidth:"80vw",textAlign:"center",boxShadow:`0 0 20px ${col}33`}}>
            {label}
          </div>
        );
      })()}
    </div>
  );
}

// ── Gantt Dep Lines SVG overlay ────────────────────────────────────────────────
function GanttDepLines({lines,milestones,rowRefs,containerRef,LABEL_W,ROW_H,hoveredLine,setHoveredLine,selectedLine,setSelectedLine}){
  const [positions,setPositions]=useState({});

  useEffect(()=>{
    const update=()=>{
      if(!containerRef.current)return;
      const container=containerRef.current.getBoundingClientRect();
      const pos={};
      Object.entries(rowRefs.current).forEach(([id,el])=>{
        if(!el)return;
        const r=el.getBoundingClientRect();
        pos[id]={top:r.top-container.top+ROW_H/2};
      });
      setPositions(pos);
    };
    update();
    const raf=requestAnimationFrame(update);
    return()=>cancelAnimationFrame(raf);
  },[lines,containerRef,rowRefs,ROW_H]);

  if(!containerRef.current)return null;
  const W=containerRef.current.offsetWidth||800;
  const H=Math.max(containerRef.current.scrollHeight,containerRef.current.offsetHeight,600);

  const getPx=(m)=>{
    const x=pct(m.date);
    const trackW=W-LABEL_W-8;
    return LABEL_W+8+(x/100)*trackW;
  };

  return(
    <svg style={{position:"absolute",top:0,left:0,width:"100%",height:H,pointerEvents:"none",zIndex:5}}>
      <defs>
        <filter id="gl-glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="gl-glow-green" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {lines.map((line,i)=>{
        const fromM=milestones.find(x=>x.id===line.fromId);
        const toM=milestones.find(x=>x.id===line.toId);
        if(!fromM||!toM)return null;
        const fp=positions[line.fromId];
        const tp=positions[line.toId];
        if(!fp||!tp)return null;
        const x1=getPx(fromM);
        const y1=fp.top;
        const x2=getPx(toM);
        const y2=tp.top;
        const col=line.type==="blockedBy"?DEP_RED:DEP_GREEN;
        const isHov=hoveredLine?.fromId===line.fromId&&hoveredLine?.toId===line.toId;
        const isSel=selectedLine?.fromId===line.fromId&&selectedLine?.toId===line.toId;
        const active=isHov||isSel;
        // Red (blockedBy): go vertical first then horizontal; Green (unlocks): go horizontal first then vertical
        const d=line.type==="blockedBy"?`M${x1},${y1} V${y2} H${x2}`:`M${x1},${y1} H${x2} V${y2}`;
        return(
          <g key={i}>
            {/* Wide invisible hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} style={{pointerEvents:"stroke",cursor:"pointer"}}
              onMouseEnter={e=>{e.stopPropagation();setHoveredLine(line);}}
              onMouseLeave={()=>setHoveredLine(null)}
              onClick={e=>{e.stopPropagation();setSelectedLine(prev=>prev?.fromId===line.fromId&&prev?.toId===line.toId?null:line);}}/>
            {/* Visible line */}
            <path d={d} fill="none" stroke={col}
              strokeWidth={active?3:1.5}
              opacity={active?1:0.65}
              filter={active?`url(#gl-glow-${line.type==="blockedBy"?"red":"green"})`:undefined}
              style={{pointerEvents:"none",transition:"stroke-width 0.1s,opacity 0.1s"}}/>
          </g>
        );
      })}
    </svg>
  );
}

// ── Gantt Bar View ─────────────────────────────────────────────────────────────
function GanttBarView({milestones,allMilestones,categories,chain,directChain,selectedId,hoverId,isMobile,onHover,onTap,onBgClick}){
  const LABEL_W=isMobile?130:220;
  const ROW_H=isMobile?36:32;
  const BAR_H=isMobile?14:16;
  const monthGroups=MONTHS.map(month=>({month,items:milestones.filter(m=>getMonthLabel(m.date)===month)})).filter(g=>g.items.length>0);
  const monthOffsets=MONTHS.map(m=>((MONTH_STARTS[m]-PROJECT_START)/(PROJECT_END-PROJECT_START))*100);
  const highlightId=selectedId||hoverId;
  const containerRef=useRef(null);
  const rowRefs=useRef({});

  const activeId=highlightId;
  const depLines=useMemo(()=>{
    if(!activeId)return[];
    const m=milestones.find(x=>x.id===activeId);
    if(!m)return[];
    const filteredIds=new Set(milestones.map(x=>x.id));
    const lines=[];
    (m.blockedBy||[]).forEach(depId=>{
      if(filteredIds.has(depId))lines.push({fromId:depId,toId:activeId,type:"blockedBy"});
    });
    milestones.forEach(x=>{
      if((x.blockedBy||[]).includes(activeId)&&filteredIds.has(x.id))
        lines.push({fromId:activeId,toId:x.id,type:"unlocks"});
    });
    return lines;
  },[activeId,milestones]);

  const [hoveredLine,setHoveredLine]=useState(null);
  const [selectedLine,setSelectedLine]=useState(null);
  useEffect(()=>{setSelectedLine(null);},[activeId]);

  return(
    <div style={{height:"100%",overflowY:"auto",overflowX:"hidden",padding:isMobile?"12px 16px 80px":"16px 28px 80px",position:"relative"}} onClick={e=>{e.stopPropagation();onBgClick();}}>
      {/* Month headers */}
      <div style={{position:"sticky",top:0,background:"#0a0a0f",zIndex:10,paddingBottom:"4px"}}>
        <div style={{position:"relative",height:"22px",marginLeft:LABEL_W+8}}>
          {MONTHS.map((month,i)=>(
            <div key={month} style={{position:"absolute",left:`${monthOffsets[i]}%`,fontSize:isMobile?"10px":"11px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#374151",whiteSpace:"nowrap"}}>
              {month.split(" ")[0]}
            </div>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} style={{position:"relative"}}>
        {depLines.length>0&&(
          <GanttBarDepLines lines={depLines} milestones={milestones} rowRefs={rowRefs} containerRef={containerRef} LABEL_W={LABEL_W} ROW_H={ROW_H} hoveredLine={hoveredLine} setHoveredLine={setHoveredLine} selectedLine={selectedLine} setSelectedLine={setSelectedLine}/>
        )}

        {monthGroups.map(({month,items})=>(
          <div key={month} style={{marginBottom:isMobile?"14px":"18px"}}>
            <div style={{fontSize:"10px",letterSpacing:"0.12em",textTransform:"uppercase",color:"#2d3748",marginBottom:"3px",fontWeight:"700",borderLeft:"2px solid #1e1e2e",paddingLeft:"5px"}}>{month}</div>
            {items.map(m=>{
              const inDirect=highlightId?directChain.has(m.id):true;
              const isSel=m.id===selectedId;
              const isHov=m.id===hoverId;
              const color=categories[m.category]||FB;
              // Use startDate and deadline for bars; fall back to date for both if missing
              const startD=m.startDate||m.date;
              const endD=m.deadline||m.date;
              const xStart=pct(startD);
              const xEnd=pct(endD);
              const barW=Math.max(xEnd-xStart,0.5); // min width so single-date items show
              const barMidPct=xStart+barW/2;
              return(
                <div key={m.id}
                  ref={el=>{if(el)rowRefs.current[m.id]=el;}}
                  onClick={e=>{e.stopPropagation();onTap(m.id);}}
                  style={{display:"flex",alignItems:"center",marginBottom:"3px",cursor:"pointer",opacity:highlightId&&!inDirect?0.08:1,transition:"opacity 0.15s",minHeight:`${ROW_H}px`}}>
                  <div
                    onMouseEnter={e=>{e.stopPropagation();onHover(m.id);}}
                    onMouseLeave={e=>{e.stopPropagation();onHover(null);}}
                    style={{width:LABEL_W,flexShrink:0,fontSize:isMobile?"12px":"13px",color:isSel?color:(inDirect&&highlightId)?"#e2e8f0":"#6b7280",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:"10px",fontWeight:isSel?"700":"400"}}>
                    {m.name}
                  </div>
                  <div
                    onMouseEnter={selectedId?e=>{e.stopPropagation();onHover(m.id);}:undefined}
                    onMouseLeave={selectedId?e=>{e.stopPropagation();onHover(null);}:undefined}
                    style={{flex:1,position:"relative",height:`${ROW_H}px`}}>
                    {MONTHS.map((mo,i)=><div key={mo} style={{position:"absolute",left:`${monthOffsets[i]}%`,top:0,bottom:0,width:"1px",background:"#161625"}}/>)}
                    {/* The horizontal bar */}
                    <div style={{
                      position:"absolute",
                      left:`${xStart}%`,
                      width:`${barW}%`,
                      top:"50%",
                      transform:"translateY(-50%)",
                      height:BAR_H,
                      background:isSel?color:`${color}bb`,
                      borderRadius:"3px",
                      boxShadow:isSel?`0 0 12px 3px ${color}55`:(isHov?`0 0 8px 2px ${color}44`:"none"),
                      transition:"all 0.15s",
                      zIndex:2,
                      minWidth:"4px"
                    }}/>
                    {/* Date labels on hover/select or when in directChain with something selected */}
                    {(isHov||isSel||(selectedId&&inDirect&&!isSel))&&(
                      <div style={{position:"absolute",left:`calc(${xEnd}% + 6px)`,top:"50%",transform:"translateY(-50%)",fontSize:"11px",color:(isHov||isSel)?color:"#94a3b8",whiteSpace:"nowrap",pointerEvents:"none",background:"#0a0a0f",padding:"2px 6px",borderRadius:"3px",border:`1px solid ${(isHov||isSel)?color+"44":"#2d2d4e"}`,zIndex:3}}>
                        {startD!==endD?`${fmtDate(startD)} – ${fmtDate(endD)}`:fmtDate(startD)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginTop:"16px",paddingTop:"12px",borderTop:"1px solid #1e1e2e"}}>
        {Object.entries(categories).map(([cat,color])=>(
          <div key={cat} style={{display:"flex",alignItems:"center",gap:"5px"}}>
            <div style={{width:"14px",height:"6px",background:color,borderRadius:"2px",flexShrink:0}}/>
            <span style={{fontSize:"11px",color:"#4b5563"}}>{cat}</span>
          </div>
        ))}
      </div>

      {/* Line label tooltip */}
      {(hoveredLine||selectedLine)&&(()=>{
        const line=selectedLine||hoveredLine;
        const fromM=milestones.find(x=>x.id===line.fromId);
        const toM=milestones.find(x=>x.id===line.toId);
        if(!fromM||!toM)return null;
        const label=line.type==="blockedBy"?`${toM.name} blocked by ${fromM.name}`:`${fromM.name} unlocks ${toM.name}`;
        const col=line.type==="blockedBy"?DEP_RED:DEP_GREEN;
        return(
          <div style={{position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",background:"#0d0d18",border:`1px solid ${col}66`,borderRadius:"6px",padding:"8px 16px",fontSize:"12px",color:col,zIndex:200,pointerEvents:"none",maxWidth:"80vw",textAlign:"center",boxShadow:`0 0 20px ${col}33`}}>
            {label}
          </div>
        );
      })()}
    </div>
  );
}

// ── Gantt Bar Dep Lines SVG overlay ───────────────────────────────────────────
function GanttBarDepLines({lines,milestones,rowRefs,containerRef,LABEL_W,ROW_H,hoveredLine,setHoveredLine,selectedLine,setSelectedLine}){
  const [positions,setPositions]=useState({});

  useEffect(()=>{
    const update=()=>{
      if(!containerRef.current)return;
      const container=containerRef.current.getBoundingClientRect();
      const pos={};
      Object.entries(rowRefs.current).forEach(([id,el])=>{
        if(!el)return;
        const r=el.getBoundingClientRect();
        pos[id]={top:r.top-container.top+ROW_H/2};
      });
      setPositions(pos);
    };
    update();
    const raf=requestAnimationFrame(update);
    return()=>cancelAnimationFrame(raf);
  },[lines,containerRef,rowRefs,ROW_H]);

  if(!containerRef.current)return null;
  const W=containerRef.current.offsetWidth||800;
  const H=Math.max(containerRef.current.scrollHeight,containerRef.current.offsetHeight,600);

  // Get the horizontal center of a bar in pixels
  const getBarCenterPx=(m)=>{
    const startD=m.startDate||m.date;
    const endD=m.deadline||m.date;
    const xStart=pct(startD);
    const xEnd=pct(endD);
    const xMid=(xStart+xEnd)/2;
    const trackW=W-LABEL_W-8;
    return LABEL_W+8+(xMid/100)*trackW;
  };

  return(
    <svg style={{position:"absolute",top:0,left:0,width:"100%",height:H,pointerEvents:"none",zIndex:5}}>
      <defs>
        <filter id="gb-glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="gb-glow-green" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {lines.map((line,i)=>{
        const fromM=milestones.find(x=>x.id===line.fromId);
        const toM=milestones.find(x=>x.id===line.toId);
        if(!fromM||!toM)return null;
        const fp=positions[line.fromId];
        const tp=positions[line.toId];
        if(!fp||!tp)return null;
        const x1=getBarCenterPx(fromM);
        const y1=fp.top;
        const x2=getBarCenterPx(toM);
        const y2=tp.top;
        const col=line.type==="blockedBy"?DEP_RED:DEP_GREEN;
        const isHov=hoveredLine?.fromId===line.fromId&&hoveredLine?.toId===line.toId;
        const isSel=selectedLine?.fromId===line.fromId&&selectedLine?.toId===line.toId;
        const active=isHov||isSel;
        // Both exit from center of bar vertically then go horizontal
        const d=line.type==="blockedBy"
          ?`M${x1},${y1} V${y2} H${x2}`
          :`M${x1},${y1} H${x2} V${y2}`;
        return(
          <g key={i}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} style={{pointerEvents:"stroke",cursor:"pointer"}}
              onMouseEnter={e=>{e.stopPropagation();setHoveredLine(line);}}
              onMouseLeave={()=>setHoveredLine(null)}
              onClick={e=>{e.stopPropagation();setSelectedLine(prev=>prev?.fromId===line.fromId&&prev?.toId===line.toId?null:line);}}/>
            <path d={d} fill="none" stroke={col}
              strokeWidth={active?3:1.5}
              opacity={active?1:0.65}
              filter={active?`url(#gb-glow-${line.type==="blockedBy"?"red":"green"})`:undefined}
              style={{pointerEvents:"none",transition:"stroke-width 0.1s,opacity 0.1s"}}/>
          </g>
        );
      })}
    </svg>
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
    const m=milestones.find(x=>x.id===id);if(!m)return 0;
    const pc=m.blockedBy.filter(d=>ids.has(d)).map(d=>assignCol(d));
    colOf[id]=pc.length>0?Math.max(...pc)+1:0;
    return colOf[id];
  };
  milestones.forEach(m=>assignCol(m.id));

  const colGroups={};
  milestones.forEach(m=>{const c=colOf[m.id]??0;if(!colGroups[c])colGroups[c]=[];colGroups[c].push(m);});
  Object.values(colGroups).forEach(arr=>arr.sort((a,b)=>new Date(a.date)-new Date(b.date)));
  const numCols=Object.keys(colGroups).length||1;

  const NODE_W=isMobile?140:170,NODE_H=isMobile?44:48,ROW_H=isMobile?64:72;
  const CORRIDOR=isMobile?90:110,COL_PITCH=NODE_W+CORRIDOR,PAD_X=24,PAD_Y=24;

  const pos={};
  Object.entries(colGroups).forEach(([ci,arr])=>{
    arr.forEach((m,ri)=>{pos[m.id]={x:parseInt(ci)*COL_PITCH+PAD_X,y:ri*ROW_H+PAD_Y,col:parseInt(ci),row:ri};});
  });

  const edgesByTarget={},edgesBySource={};
  milestones.forEach(m=>{
    m.blockedBy.forEach(depId=>{
      if(!ids.has(depId)||!pos[depId]||!pos[m.id])return;
      if(!edgesByTarget[m.id])edgesByTarget[m.id]=[];edgesByTarget[m.id].push(depId);
      if(!edgesBySource[depId])edgesBySource[depId]=[];edgesBySource[depId].push(m.id);
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

  const getTrackX=(fc,ti,tt)=>{
    const cl=fc*COL_PITCH+PAD_X+NODE_W+4,cr=(fc+1)*COL_PITCH+PAD_X-4,cw=cr-cl;
    if(tt<=1)return cl+cw/2;
    const step=Math.min(8,(cw-4)/(tt-1));
    return cl+(cw-step*(tt-1))/2+ti*step;
  };

  const cc={};const edges=[];
  milestones.forEach(m=>{
    const inD=edgesByTarget[m.id]||[];
    m.blockedBy.forEach((depId,inIdx)=>{
      if(!ids.has(depId))return;
      const fp=pos[depId],tp=pos[m.id];if(!fp||!tp)return;
      const fromM=milestones.find(x=>x.id===depId);
      const ec=categories[fromM?.category]||FB;
      const ck=fp.col;
      if(!cc[ck])cc[ck]=0;
      const ti=cc[ck]++;const tt=corridorEdges[ck]?.length??1;
      const tx=getTrackX(ck,ti,tt);
      const totalIn=inD.length;
      const ef=totalIn<=1?0.5:0.2+(inIdx/(totalIn-1))*0.6;
      const outIds=edgesBySource[depId]||[];
      const exitF=outIds.length<=1?0.5:0.2+(outIds.indexOf(m.id)/(outIds.length-1))*0.6;
      edges.push({fromId:depId,toId:m.id,color:ec,trackX:tx,x1:fp.x+NODE_W,y1:fp.y+exitF*NODE_H,x2:tp.x,y2:tp.y+ef*NODE_H});
    });
  });

  const maxRow=Object.values(pos).length>0?Math.max(...Object.values(pos).map(p=>p.row)):0;
  const totalW=numCols*COL_PITCH+PAD_X*2+80;
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
            return(<g key={c}>
              <marker id={`a-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c}/></marker>
              <marker id={`ad-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c} fillOpacity="0.15"/></marker>
            </g>);
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
            const sid=e.color.replace("#","");
            const d=makePath(e.x1,e.y1,e.x2,e.y2,e.trackX);
            const sw=isSel?3.5:isHov?2.5:isActive?2:1.2;
            return(<g key={ek} style={{cursor:"pointer"}}
              onMouseEnter={ev=>{ev.stopPropagation();setHoveredEdge({fromId:e.fromId,toId:e.toId});}}
              onMouseLeave={()=>setHoveredEdge(null)}
              onClick={ev=>{ev.stopPropagation();onEdgeTap(e.fromId,e.toId);}}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={16}/>
              <path d={d} fill="none" stroke={e.color} strokeWidth={sw}
                filter={isSel||isHov?"url(#eg)":undefined}
                markerEnd={isInactive?`url(#ad-${sid})`:`url(#a-${sid})`}
                opacity={isInactive?0.07:isActive?1:0.35}
                style={{transition:"opacity 0.12s,stroke-width 0.12s"}}/>
            </g>);
          })}
        </g>
        <g>
          {milestones.map(m=>{
            const p=pos[m.id];if(!p)return null;
            const color=categories[m.category]||FB;
            const inChain=highlightId?chain.has(m.id):true;
            const isSel=m.id===selectedId;
            const isHov=m.id===hoveredNode;
            const isEP=!!(edgeHighlightSet?.has(m.id))||!!(hoveredEdge&&(hoveredEdge.fromId===m.id||hoveredEdge.toId===m.id));
            const isFrom=selectedEdge?.fromId===m.id||hoveredEdge?.fromId===m.id;
            const isTo=selectedEdge?.toId===m.id||hoveredEdge?.toId===m.id;
            const anythingActive=!!(highlightId||selectedEdge||hoveredEdge);
            const effectivelyActive=isSel||inChain||isEP;
            const shouldDim=anythingActive&&!effectivelyActive;
            const maxC=isMobile?17:21;
            const tName=m.name.length>maxC?m.name.slice(0,maxC-1)+"…":m.name;
            const maxCC=isMobile?18:23;
            const tCat=m.category.length>maxCC?m.category.slice(0,maxCC-1)+"…":m.category;
            return(<g key={m.id} transform={`translate(${p.x},${p.y})`}
              onMouseEnter={ev=>{ev.stopPropagation();onHover(m.id);setHoveredNode(m.id);}}
              onMouseLeave={()=>{onHover(null);setHoveredNode(null);}}
              onClick={ev=>{ev.stopPropagation();onTap(m.id);}}
              style={{cursor:"pointer"}}>
              <rect width={NODE_W} height={NODE_H} rx={5} fill="#0a0a0f"/>
              <rect width={NODE_W} height={NODE_H} rx={5}
                fill={isSel||isEP?`${color}22`:"#0e0e1a"}
                stroke={isSel?color:isTo?color:isFrom?color+"99":isHov?"#4d4d7a":"#2d2d50"}
                strokeWidth={isSel?2:isEP?2:isHov?1.5:1}
                filter={isSel||isEP?"url(#ng)":undefined}
                opacity={shouldDim?0.18:1} style={{transition:"opacity 0.12s"}}/>
              <rect width={3} height={NODE_H} rx={2} fill={color} opacity={shouldDim?0.1:1}/>
              <text x={12} y={isMobile?19:20} fill={shouldDim?"#252535":"#dde4f0"} fontSize={isMobile?10:11} fontFamily="DM Mono,monospace" fontWeight={isSel||isEP?"700":"400"} opacity={shouldDim?0.18:1}>{tName}</text>
              <text x={12} y={isMobile?33:36} fill={color} fontSize={isMobile?8.5:9.5} fontFamily="DM Mono,monospace" opacity={shouldDim?0.08:0.7}>{tCat}</text>
              {(isHov||isSel)&&!shouldDim&&(
                <g transform={`translate(${NODE_W+7},${NODE_H/2-9})`}>
                  <rect x={0} y={0} width={56} height={18} rx={3} fill="#0d0d18" stroke={`${color}55`} strokeWidth={1}/>
                  <text x={28} y={12} fill={color} fontSize={9} fontFamily="DM Mono,monospace" textAnchor="middle">{fmtDate(m.date)}</text>
                </g>
              )}
            </g>);
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
    <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"14px",paddingBottom:"12px",borderBottom:"1px solid #1e1e2e"}}>
      {fields.map(([key,label])=>(
        <button key={key} onClick={()=>onToggle(key)} style={{padding:"3px 8px",borderRadius:"3px",border:`1px solid ${settings[key]?"#3b3b6b":"#1e1e2e"}`,background:settings[key]?"#3b3b6b22":"transparent",color:settings[key]?"#a78bfa":"#4b5563",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>
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
  const statColor=STATUSES[milestone.status]||"#4b5563";
  const blockedByMs=(milestone.blockedBy||[]).map(id=>allMilestones.find(m=>m.id===id)).filter(Boolean);
  const unlocks=allMilestones.filter(m=>(m.blockedBy||[]).includes(milestone.id));
  const ready=isReady(milestone,allMilestones);

  const Chip=({label,col})=>(
    <span style={{display:"inline-block",padding:"3px 9px",borderRadius:"4px",background:`${col}33`,border:`1px solid ${col}77`,fontSize:"11px",color:"#f1f5f9",marginRight:"5px",marginBottom:"5px",fontWeight:"500"}}>{label}</span>
  );

  return(
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
        <div style={{fontSize:"11px",letterSpacing:"0.1em",textTransform:"uppercase",color,fontWeight:"700"}}>{milestone.category}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"20px",padding:"0",lineHeight:1}}>✕</button>
      </div>
      <div style={{fontSize:"16px",fontWeight:"700",color:"#f1f5f9",marginBottom:"5px",lineHeight:"1.4"}}>{milestone.name}</div>
      {ready&&<div style={{fontSize:"11px",color:"#10b981",marginBottom:"10px"}}>✓ Ready to work on</div>}

      <PanelSettingsBar settings={settings} onToggle={onToggleSetting}/>

      <div style={{display:"flex",flexWrap:"wrap",marginBottom:"10px"}}>
        {settings.showDate&&milestone.date&&<Chip label={fmtDateLong(milestone.date)} col="#6b7280"/>}
        {settings.showPriority&&milestone.priority&&<Chip label={milestone.priority} col={priColor}/>}
        {settings.showStatus&&milestone.status&&<Chip label={milestone.status} col={statColor}/>}
        {settings.showComplexity&&milestone.effort!=null&&<Chip label={`Complexity: ${milestone.effort}`} col="#4b5563"/>}
        {settings.showOwner&&milestone.owner&&<Chip label={milestone.owner} col="#6b7280"/>}
      </div>

      {milestone.description&&(
        <div style={{fontSize:"13px",color:"#94a3b8",lineHeight:"1.8",marginBottom:"14px"}}>{milestone.description}</div>
      )}

      {settings.showNotes&&milestone.notes&&(
        <div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"11px",letterSpacing:"0.1em",textTransform:"uppercase",color:"#6b7280",marginBottom:"6px"}}>Notes</div>
          <div style={{fontSize:"13px",color:"#cbd5e1",lineHeight:"1.8",background:"#1a1a2e",borderRadius:"6px",padding:"10px 12px",borderLeft:"2px solid #a78bfa",whiteSpace:"pre-wrap"}}>{milestone.notes}</div>
        </div>
      )}

      {settings.showBlockedBy&&blockedByMs.length>0&&(
        <div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"11px",letterSpacing:"0.1em",textTransform:"uppercase",color:DEP_RED,marginBottom:"6px"}}>Blocked By</div>
          {blockedByMs.map(dep=>(
            <div key={dep.id} onClick={()=>onNavigate(dep.id)} style={{padding:"8px 11px",marginBottom:"4px",background:"#1a0e0e",borderRadius:"6px",fontSize:"13px",color:DEP_RED,cursor:"pointer",borderLeft:`2px solid ${DEP_RED}66`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{dep.name}</span>
              <span style={{fontSize:"11px",color:STATUSES[dep.status]||"#4b5563",flexShrink:0,marginLeft:"8px"}}>{dep.status}</span>
            </div>
          ))}
        </div>
      )}

      {settings.showUnlocks&&unlocks.length>0&&(
        <div>
          <div style={{fontSize:"11px",letterSpacing:"0.1em",textTransform:"uppercase",color:DEP_GREEN,marginBottom:"6px"}}>Unlocks</div>
          {unlocks.map(m=>(
            <div key={m.id} onClick={()=>onNavigate(m.id)} style={{padding:"8px 11px",marginBottom:"4px",background:"#0e1a0e",borderRadius:"6px",fontSize:"13px",color:DEP_GREEN,cursor:"pointer",borderLeft:`2px solid ${DEP_GREEN}66`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{m.name}</span>
              <span style={{fontSize:"11px",color:STATUSES[m.status]||"#4b5563",flexShrink:0,marginLeft:"8px"}}>{m.status}</span>
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
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:"340px",borderLeft:"1px solid #1e1e2e",padding:"20px",background:"#0d0d18",overflowY:"auto",zIndex:100}} onClick={e=>e.stopPropagation()}>
      <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} settings={settings} onToggleSetting={onToggleSetting} onClose={onClose} onNavigate={onNavigate}/>
    </div>
  );
}

// ── Bottom Sheet ───────────────────────────────────────────────────────────────
function BottomSheet({milestone,allMilestones,categories,settings,onToggleSetting,onClose,onNavigate}){
  return(
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000088",zIndex:90}}/>
      <div style={{position:"fixed",left:0,right:0,bottom:0,background:"#0d0d18",borderTop:"1px solid #2d2d4e",borderRadius:"16px 16px 0 0",padding:"16px 20px 44px",zIndex:100,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:"40px",height:"4px",background:"#2d2d4e",borderRadius:"2px",margin:"0 auto 16px"}}/>
        <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} settings={settings} onToggleSetting={onToggleSetting} onClose={onClose} onNavigate={onNavigate}/>
      </div>
    </>
  );
}
