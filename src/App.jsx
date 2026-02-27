import { useState, useMemo, useEffect, useCallback } from "react";
import { loadFromNotion, updateTask, updateDependencies, updateLinkedPhase, createTask, deleteTask } from "./notion.js";

// ── Static constants (not phase-dependent) ────────────────────────────────────
const PRIORITIES = { High:"#ef4444", Medium:"#f59e0b", Low:"#6b7280" };
const STATUSES   = { "Not Started":"#374151", "In Progress":"#3b82f6", "Waiting / Blocked":"#f97316", "Done":"#10b981" };
const MONTHS = ["March 2026","April 2026","May 2026","June 2026","July 2026","August 2026","September 2026"];
const MONTH_STARTS = { "March 2026":new Date("2026-03-01"),"April 2026":new Date("2026-04-01"),"May 2026":new Date("2026-05-01"),"June 2026":new Date("2026-06-01"),"July 2026":new Date("2026-07-01"),"August 2026":new Date("2026-08-01"),"September 2026":new Date("2026-09-01") };
const PROJECT_START = new Date("2026-03-01");
const PROJECT_END   = new Date("2026-09-30");
const FALLBACK_COLOR = "#6b7280";

function pct(d) { return ((new Date(d)-PROJECT_START)/(PROJECT_END-PROJECT_START))*100; }
function dateToMonth(d) { const x=new Date(d+"T12:00:00"); return x.toLocaleString("en-US",{month:"long"})+" "+x.getFullYear(); }
function fmtDate(d) { if(!d) return ""; return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); }

function useIsMobile() {
  const [v,setV]=useState(typeof window!=="undefined"?window.innerWidth<640:false);
  useEffect(()=>{ const h=()=>setV(window.innerWidth<640); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  return v;
}
function buildChain(id,milestones) {
  if(!id) return new Set();
  const chain=new Set([id]);
  const addDeps=(mid)=>{ const m=milestones.find(x=>x.id===mid); if(!m) return; m.blockedBy.forEach(dep=>{ if(!chain.has(dep)){chain.add(dep);addDeps(dep);} }); };
  const addDependents=(mid)=>{ milestones.forEach(m=>{ if((m.blockedBy||[]).includes(mid)&&!chain.has(m.id)){chain.add(m.id);addDependents(m.id);} }); };
  addDeps(id); addDependents(id);
  return chain;
}
const inputStyle = { background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"4px",color:"#e2e8f0",fontFamily:"'DM Mono','Courier New',monospace",fontSize:"11px",padding:"4px 7px",outline:"none",width:"100%",boxSizing:"border-box" };

// ── Loading screen ─────────────────────────────────────────────────────────────
function LoadingScreen({ error, onRetry }) {
  return (
    <div style={{ fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px" }}>
      {error ? (
        <>
          <div style={{ fontSize:"11px",color:"#ef4444",maxWidth:"400px",textAlign:"center",lineHeight:"1.8",background:"#1a0a0a",border:"1px solid #ef444444",borderRadius:"8px",padding:"20px" }}>
            <div style={{ fontSize:"13px",fontWeight:"700",marginBottom:"8px" }}>Failed to load from Notion</div>
            {error}
          </div>
          <button onClick={onRetry} style={{ padding:"8px 20px",borderRadius:"6px",border:"1px solid #3b3b6b",background:"#1a1a2e",color:"#a78bfa",cursor:"pointer",fontSize:"11px",fontFamily:"inherit" }}>Retry</button>
        </>
      ) : (
        <>
          <div style={{ fontSize:"10px",letterSpacing:"0.2em",color:"#374151",textTransform:"uppercase" }}>Loading from Notion</div>
          <div style={{ display:"flex",gap:"6px" }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ width:"6px",height:"6px",borderRadius:"50%",background:"#3b3b6b",animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>
            ))}
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        </>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function GanttApp() {
  const [milestones,   setMilestones]  = useState([]);
  const [phases,       setPhases]      = useState([]);
  const [categories,   setCategories]  = useState({}); // { phaseName: colorHex } — live from Notion
  const [loading,      setLoading]     = useState(true);
  const [loadError,    setLoadError]   = useState(null);
  const [saving,       setSaving]      = useState(false);
  const [view,         setView]        = useState("gantt");
  const [search,       setSearch]      = useState("");
  const [filterPhase,  setFilterPhase] = useState("All");
  const [hoverIdDesktop,setHoverIdDesktop] = useState(null);
  const [selectedId,   setSelectedId]  = useState(null);
  const [selectedEdge, setSelectedEdge]= useState(null);
  const [showFilters,  setShowFilters] = useState(false);
  const isMobile = useIsMobile();

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const { milestones: ms, phases: ps, categories: cats } = await loadFromNotion();
      setMilestones(ms);
      setPhases(ps);
      setCategories(cats);
    } catch(e) { setLoadError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const updateMilestone = useCallback(async (id, field, value) => {
    setMilestones(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, [field]: value };
      if (field === "date") updated.month = dateToMonth(value);
      return updated;
    }));
    setSaving(true);
    try {
      if (field === "blockedBy") await updateDependencies(id, value);
      else if (field === "category") await updateLinkedPhase(id, value, phases);
      else await updateTask(id, field, value);
    } catch(e) { console.error("Notion write failed:", e); loadData(); }
    finally { setSaving(false); }
  }, [phases, loadData]);

  const addMilestone = useCallback(async () => {
    setSaving(true);
    try {
      const phaseMap = Object.fromEntries(phases.map(p => [p.id, p.name]));
      const newTask = await createTask(phaseMap);
      setMilestones(prev => [...prev, newTask]);
    } catch(e) { console.error("Failed to create task:", e); }
    finally { setSaving(false); }
  }, [phases]);

  const deleteMilestone = useCallback(async (id) => {
    setMilestones(prev => prev.filter(m=>m.id!==id).map(m=>({...m,blockedBy:(m.blockedBy||[]).filter(d=>d!==id)})));
    if (selectedId === id) setSelectedId(null);
    setSaving(true);
    try { await deleteTask(id); }
    catch(e) { console.error("Failed to delete:", e); loadData(); }
    finally { setSaving(false); }
  }, [selectedId, loadData]);

  const filtered = useMemo(() => milestones.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchPhase  = filterPhase === "All" || m.category === filterPhase;
    return matchSearch && matchPhase;
  }), [milestones, search, filterPhase]);

  const highlightId    = hoverIdDesktop || selectedId;
  const edgeHighlightSet = useMemo(() => selectedEdge ? new Set([selectedEdge.fromId, selectedEdge.toId]) : null, [selectedEdge]);
  const chain          = useMemo(() => buildChain(highlightId, milestones), [highlightId, milestones]);
  const selectedMilestone = selectedId ? milestones.find(m => m.id === selectedId) : null;

  const handleClosePanel = () => setSelectedId(null);
  const handleTap = (id) => { setSelectedEdge(null); setSelectedId(prev=>prev===id?null:id); if(!isMobile) setHoverIdDesktop(null); };
  const handleEdgeTap = (fromId,toId) => { setSelectedId(null); setHoverIdDesktop(null); setSelectedEdge(prev=>prev?.fromId===fromId&&prev?.toId===toId?null:{fromId,toId}); };

  if (loading || loadError) return <LoadingScreen error={loadError} onRetry={loadData}/>;

  // Phase list for filter bar — derived entirely from Notion
  const phaseNames = ["All", ...phases.map(p => p.name)];

  return (
    <div style={{ fontFamily:"'DM Mono','Courier New',monospace",background:"#0a0a0f",minHeight:"100vh",color:"#e2e8f0" }}>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1e1e2e",padding:isMobile?"12px 16px":"16px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0d0d18",position:"sticky",top:0,zIndex:50 }}>
        <div>
          <div style={{ fontSize:"10px",letterSpacing:"0.15em",color:"#6b7280",textTransform:"uppercase",marginBottom:"2px" }}>Product Roadmap</div>
          <div style={{ fontSize:isMobile?"14px":"17px",fontWeight:"700",color:"#f1f5f9",letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:"10px" }}>
            Mar → Sep 2026
            {saving && <span style={{ fontSize:"9px",color:"#6b7280",fontWeight:"400",letterSpacing:"0.1em" }}>saving…</span>}
          </div>
        </div>
        <div style={{ display:"flex",gap:"6px",alignItems:"center" }}>
          <button onClick={loadData} title="Refresh from Notion" style={{ background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"6px",padding:"6px 10px",color:"#6b7280",cursor:"pointer",fontSize:"11px",fontFamily:"inherit" }}>↺</button>
          {isMobile && <button onClick={()=>setShowFilters(f=>!f)} style={{ background:showFilters?"#3b3b6b":"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"6px",padding:"6px 10px",color:showFilters?"#a78bfa":"#6b7280",cursor:"pointer",fontSize:"11px",fontFamily:"inherit" }}>⚙︎</button>}
          <div style={{ display:"flex",background:"#1a1a2e",borderRadius:"6px",padding:"2px",border:"1px solid #2d2d4e" }}>
            {[["gantt","Timeline"],["deps",isMobile?"Deps":"Dep Map"]].map(([v,label])=>(
              <button key={v} onClick={()=>setView(v)} style={{ padding:isMobile?"5px 8px":"5px 12px",borderRadius:"4px",border:"none",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:v===view?"700":"400",background:v===view?"#3b3b6b":"transparent",color:v===view?"#a78bfa":"#6b7280" }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      {(!isMobile || showFilters) && (
        <div style={{ padding:isMobile?"10px 16px":"10px 28px",borderBottom:"1px solid #1e1e2e",background:"#0d0d18" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search milestones…" style={{ ...inputStyle,width:isMobile?"100%":"220px",marginBottom:"10px" }}/>
          <div style={{ display:"flex",gap:"6px",flexWrap:"wrap" }}>
            {phaseNames.map(p => {
              const color = categories[p] || "#a78bfa";
              const active = filterPhase === p;
              return (
                <button key={p} onClick={()=>{ setFilterPhase(p); if(isMobile) setShowFilters(false); }} style={{ padding:"4px 9px",borderRadius:"4px",border:`1px solid ${active?(p==="All"?"#a78bfa":color):"#2d2d4e"}`,background:active?`${p==="All"?"#a78bfa":color}22`:"transparent",color:active?(p==="All"?"#a78bfa":color):"#6b7280",fontSize:"10px",cursor:"pointer",fontFamily:"inherit" }}>{p}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ padding:isMobile?"14px 16px":"20px 28px",overflowX:"auto" }}>
        {view==="gantt" && <GanttView milestones={filtered} allMilestones={milestones} categories={categories} chain={chain} highlightId={highlightId} isMobile={isMobile} onHover={id=>{ if(!isMobile) setHoverIdDesktop(id); }} onTap={handleTap} selectedId={selectedId}/>}
        {view==="deps"  && <DepsView  milestones={filtered} allMilestones={milestones} categories={categories} chain={chain} highlightId={highlightId} isMobile={isMobile} onHover={id=>{ if(!isMobile) setHoverIdDesktop(id); }} onTap={handleTap} selectedId={selectedId} selectedEdge={selectedEdge} edgeHighlightSet={edgeHighlightSet} onEdgeTap={handleEdgeTap}/>}
      </div>

      {/* Detail panel */}
      {selectedMilestone && (
        isMobile
          ? <BottomSheet milestone={selectedMilestone} allMilestones={milestones} categories={categories} onClose={handleClosePanel} onNavigate={handleTap}/>
          : <SidePanel   milestone={selectedMilestone} allMilestones={milestones} categories={categories} onClose={handleClosePanel} onNavigate={handleTap}/>
      )}
    </div>
  );
}

// ── Gantt View ─────────────────────────────────────────────────────────────────
function GanttView({ milestones, categories, chain, highlightId, isMobile, onHover, onTap, selectedId }) {
  const [hoverId, setHoverId] = useState(null);
  const LABEL_W = isMobile ? 108 : 200;
  const monthGroups = MONTHS.map(month => ({ month, items: milestones.filter(m => m.month === month) })).filter(g => g.items.length > 0);
  const monthOffsets = MONTHS.map(m => ((MONTH_STARTS[m] - PROJECT_START) / (PROJECT_END - PROJECT_START)) * 100);

  return (
    <div>
      <div style={{ position:"relative", height:"22px", marginBottom:"6px", marginLeft:LABEL_W+8 }}>
        {MONTHS.map((month, i) => (
          <div key={month} style={{ position:"absolute", left:`${monthOffsets[i]}%`, fontSize:isMobile?"8px":"9px", letterSpacing:"0.1em", textTransform:"uppercase", color:"#374151", whiteSpace:"nowrap" }}>
            {month.split(" ")[0]}
          </div>
        ))}
      </div>
      {monthGroups.map(({ month, items }) => (
        <div key={month} style={{ marginBottom:isMobile?"14px":"18px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.15em", textTransform:"uppercase", color:"#2d3748", marginBottom:"4px", fontWeight:"700", borderLeft:"2px solid #1e1e2e", paddingLeft:"4px" }}>{month}</div>
          {items.map(m => {
            const inChain = highlightId ? chain.has(m.id) : true;
            const isSelected = m.id === selectedId;
            const isHovered  = m.id === hoverId;
            const color = categories[m.category] || FALLBACK_COLOR;
            const x   = pct(m.date);
            const sz  = isSelected ? (isMobile?14:12) : (isMobile?11:9);
            return (
              <div key={m.id}
                onMouseEnter={() => { onHover(m.id); setHoverId(m.id); }}
                onMouseLeave={() => { onHover(null);  setHoverId(null); }}
                onClick={() => onTap(m.id)}
                style={{ display:"flex", alignItems:"center", marginBottom:"2px", cursor:"pointer", opacity:highlightId&&!inChain?0.12:1, transition:"opacity 0.15s", minHeight:isMobile?"30px":"24px" }}>
                <div style={{ width:LABEL_W, flexShrink:0, fontSize:isMobile?"9px":"10px", color:isSelected?color:(inChain&&highlightId)?"#e2e8f0":"#6b7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", paddingRight:"8px", fontWeight:isSelected?"700":"400" }}>
                  {m.name}
                </div>
                <div style={{ flex:1, position:"relative", height:isMobile?"30px":"22px" }}>
                  {MONTHS.map((mo,i) => <div key={mo} style={{ position:"absolute", left:`${monthOffsets[i]}%`, top:0, bottom:0, width:"1px", background:"#161625" }} />)}
                  <div style={{ position:"absolute", left:`${x}%`, top:"50%", transform:"translate(-50%,-50%) rotate(45deg)", width:sz, height:sz, background:isSelected?color:`${color}cc`, boxShadow:isSelected?`0 0 18px 4px ${color}99, 0 0 6px 1px ${color}`:(isHovered?`0 0 10px 2px ${color}66`:"none"), transition:"all 0.15s", zIndex:2 }} />
                  {(isHovered || isSelected) && (
                    <div style={{ position:"absolute", left:`calc(${x}% + ${sz/2+6}px)`, top:"50%", transform:"translateY(-50%)", fontSize:"9px", color, whiteSpace:"nowrap", pointerEvents:"none", fontFamily:"'DM Mono',monospace", background:"#0a0a0f", padding:"1px 5px", borderRadius:"3px", border:`1px solid ${color}44`, zIndex:3 }}>
                      {fmtDate(m.date)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {/* Legend — built from live categories */}
      <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", marginTop:"20px", paddingTop:"14px", borderTop:"1px solid #1e1e2e" }}>
        {Object.entries(categories).map(([cat,color]) => (
          <div key={cat} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
            <div style={{ width:"7px", height:"7px", background:color, transform:"rotate(45deg)", flexShrink:0 }} />
            <span style={{ fontSize:"9px", color:"#4b5563" }}>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deps View ──────────────────────────────────────────────────────────────────
function DepsView({ milestones, categories, chain, highlightId, isMobile, onHover, onTap, selectedId, selectedEdge, edgeHighlightSet, onEdgeTap }) {
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const ids = new Set(milestones.map(m => m.id));

  const colOf = {};
  const assignCol = (id) => {
    if (colOf[id] !== undefined) return colOf[id];
    const m = milestones.find(x => x.id === id);
    if (!m) return 0;
    const parentCols = m.blockedBy.filter(d => ids.has(d)).map(d => assignCol(d));
    colOf[id] = parentCols.length > 0 ? Math.max(...parentCols) + 1 : 0;
    return colOf[id];
  };
  milestones.forEach(m => assignCol(m.id));

  const colGroups = {};
  milestones.forEach(m => {
    const c = colOf[m.id] ?? 0;
    if (!colGroups[c]) colGroups[c] = [];
    colGroups[c].push(m);
  });
  Object.values(colGroups).forEach(arr => arr.sort((a,b) => new Date(a.date)-new Date(b.date)));
  const numCols = Math.max(...Object.keys(colGroups).map(Number)) + 1;

  const NODE_W=isMobile?130:160, NODE_H=isMobile?42:46, ROW_H=isMobile?62:70;
  const CORRIDOR=isMobile?80:100, COL_PITCH=NODE_W+CORRIDOR, TRACK_GAP=8, PAD_X=20, PAD_Y=20;

  const pos = {};
  Object.entries(colGroups).forEach(([ci,arr]) => {
    arr.forEach((m,ri) => { pos[m.id]={ x:parseInt(ci)*COL_PITCH+PAD_X, y:ri*ROW_H+PAD_Y, col:parseInt(ci), row:ri }; });
  });

  const edgesByTarget={}, edgesBySource={};
  milestones.forEach(m => {
    m.blockedBy.forEach(depId => {
      if(!ids.has(depId)) return;
      if(!pos[depId]||!pos[m.id]) return;
      if(!edgesByTarget[m.id]) edgesByTarget[m.id]=[];
      edgesByTarget[m.id].push(depId);
      if(!edgesBySource[depId]) edgesBySource[depId]=[];
      edgesBySource[depId].push(m.id);
    });
  });

  const corridorEdges={};
  milestones.forEach(m => {
    m.blockedBy.forEach(depId => {
      if(!ids.has(depId)||!pos[depId]) return;
      const ck=pos[depId].col;
      if(!corridorEdges[ck]) corridorEdges[ck]=[];
      corridorEdges[ck].push({fromId:depId,toId:m.id});
    });
  });

  const getTrackX=(fromCol,trackIdx,totalTracks)=>{
    const corrLeft=fromCol*COL_PITCH+PAD_X+NODE_W+6, corrRight=(fromCol+1)*COL_PITCH+PAD_X-6, corrW=corrRight-corrLeft;
    if(totalTracks<=1) return corrLeft+corrW/2;
    const step=Math.min(TRACK_GAP,(corrW-4)/(totalTracks-1)), totalSpan=step*(totalTracks-1);
    return corrLeft+(corrW-totalSpan)/2+trackIdx*step;
  };

  const corridorCounters={};
  const edges=[];
  milestones.forEach(m => {
    const incomingDeps=edgesByTarget[m.id]||[];
    m.blockedBy.forEach((depId,incomingIdx) => {
      if(!ids.has(depId)) return;
      const fp=pos[depId],tp=pos[m.id]; if(!fp||!tp) return;
      const fromM=milestones.find(x=>x.id===depId);
      const edgeColor=categories[fromM?.category]||FALLBACK_COLOR;
      const ck=fp.col;
      if(!corridorCounters[ck]) corridorCounters[ck]=0;
      const trackIdx=corridorCounters[ck]++;
      const totalTracks=corridorEdges[ck]?.length??1;
      const trackX=getTrackX(ck,trackIdx,totalTracks);
      const totalIncoming=incomingDeps.length;
      const entryFrac=totalIncoming<=1?0.5:0.2+(incomingIdx/(totalIncoming-1))*0.6;
      const outgoingToIds=edgesBySource[depId]||[];
      const outgoingIdx=outgoingToIds.indexOf(m.id);
      const totalOutgoing=outgoingToIds.length;
      const exitFrac=totalOutgoing<=1?0.5:0.2+(outgoingIdx/(totalOutgoing-1))*0.6;
      edges.push({ fromId:depId,toId:m.id,color:edgeColor,trackX,
        x1:fp.x+NODE_W, y1:fp.y+exitFrac*NODE_H, x2:tp.x, y2:tp.y+entryFrac*NODE_H });
    });
  });

  const maxRow=Object.values(pos).length>0?Math.max(...Object.values(pos).map(p=>p.row)):0;
  const totalW=numCols*COL_PITCH+PAD_X*2, totalH=(maxRow+1)*ROW_H+PAD_Y*2;

  const makePath=(x1,y1,x2,y2,tx)=>{
    const R=5,h1=Math.abs(tx-x1),h2=Math.abs(x2-tx),vd=Math.abs(y2-y1);
    const r=Math.min(R,h1/2,h2/2,vd/2);
    if(vd<1) return `M${x1},${y1} L${x2},${y2}`;
    const down=y2>y1,vy1=down?y1+r:y1-r,vy2=down?y2-r:y2+r;
    return [`M${x1},${y1}`,`H${tx-r}`,`Q${tx},${y1} ${tx},${vy1}`,`V${vy2}`,`Q${tx},${y2} ${tx+r},${y2}`,`H${x2}`].join(" ");
  };

  const uniqueColors=[...new Set(edges.map(e=>e.color))];

  return (
    <div style={{ overflowX:"auto", overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
      <svg width={totalW} height={totalH} style={{ display:"block", touchAction:"pan-x pan-y" }}>
        <defs>
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="node-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {uniqueColors.map(c => {
            const s=c.replace("#","");
            return (
              <g key={c}>
                <marker id={`arr-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c}/></marker>
                <marker id={`arr-dim-${s}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0.5 L6,3.5 L0,6.5 Z" fill={c} fillOpacity="0.2"/></marker>
              </g>
            );
          })}
        </defs>

        {edges.map(e => {
          const edgeKey=`${e.fromId}-${e.toId}`;
          const isEdgeSel=selectedEdge?.fromId===e.fromId&&selectedEdge?.toId===e.toId;
          const isEdgeHov=hoveredEdge?.fromId===e.fromId&&hoveredEdge?.toId===e.toId;
          const isNodeActive=highlightId?(chain.has(e.toId)&&chain.has(e.fromId)):false;
          const isEdgeActive=edgeHighlightSet?(edgeHighlightSet.has(e.fromId)&&edgeHighlightSet.has(e.toId)):false;
          const isActive=isEdgeSel||isEdgeActive||isNodeActive||isEdgeHov;
          const anythingActive=!!(highlightId||selectedEdge);
          const isInactive=anythingActive&&!isActive;
          const safeId=e.color.replace("#","");
          const d=makePath(e.x1,e.y1,e.x2,e.y2,e.trackX);
          const strokeW=isEdgeSel?3.5:isEdgeHov?2.5:isActive?2:1.2;
          return (
            <g key={edgeKey} style={{ cursor:"pointer" }}
              onMouseEnter={()=>setHoveredEdge({fromId:e.fromId,toId:e.toId})}
              onMouseLeave={()=>setHoveredEdge(null)}
              onClick={ev=>{ ev.stopPropagation(); onEdgeTap(e.fromId,e.toId); }}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={14}/>
              <path d={d} fill="none" stroke={e.color} strokeWidth={strokeW}
                filter={isEdgeSel||isEdgeHov?"url(#edge-glow)":undefined}
                markerEnd={isInactive?`url(#arr-dim-${safeId})`:`url(#arr-${safeId})`}
                opacity={isInactive?0.08:isActive?1:0.4}
                style={{ transition:"opacity 0.12s,stroke-width 0.12s" }}/>
            </g>
          );
        })}

        {milestones.map(m => {
          const p=pos[m.id]; if(!p) return null;
          const color=categories[m.category]||FALLBACK_COLOR;
          const inChain=highlightId?chain.has(m.id):true;
          const isSel=m.id===selectedId;
          const isHov=m.id===hoveredNode;
          const isEdgeEndpoint=!!(edgeHighlightSet?.has(m.id))||!!(hoveredEdge&&(hoveredEdge.fromId===m.id||hoveredEdge.toId===m.id));
          const isEndpointFrom=!!(selectedEdge?.fromId===m.id)||!!(hoveredEdge?.fromId===m.id);
          const isEndpointTo=!!(selectedEdge?.toId===m.id)||!!(hoveredEdge?.toId===m.id);
          const anythingActive=!!(highlightId||selectedEdge||hoveredEdge);
          const effectivelyActive=isSel||inChain||isEdgeEndpoint;
          const shouldDim=anythingActive&&!effectivelyActive;
          const maxC=isMobile?16:19, truncName=m.name.length>maxC?m.name.slice(0,maxC-1)+"…":m.name;
          const maxCC=isMobile?18:22, truncCat=m.category.length>maxCC?m.category.slice(0,maxCC-1)+"…":m.category;
          const glowActive=isSel||isEdgeEndpoint;
          return (
            <g key={m.id} transform={`translate(${p.x},${p.y})`}
              onMouseEnter={()=>{ onHover(m.id); setHoveredNode(m.id); }}
              onMouseLeave={()=>{ onHover(null); setHoveredNode(null); }}
              onClick={()=>onTap(m.id)} style={{ cursor:"pointer" }}>
              <rect width={NODE_W} height={NODE_H} rx={5} fill="#0a0a0f"/>
              <rect width={NODE_W} height={NODE_H} rx={5}
                fill={isSel||isEdgeEndpoint?`${color}22`:"#0e0e1a"}
                stroke={isSel?color:isEndpointTo?color:isEndpointFrom?color+"99":isHov?"#4d4d7a":"#2d2d50"}
                strokeWidth={isSel?2:isEdgeEndpoint?2:isHov?1.5:1}
                filter={glowActive?"url(#node-glow)":undefined}
                opacity={shouldDim?0.2:1} style={{ transition:"opacity 0.12s" }}/>
              <rect width={3} height={NODE_H} rx={2} fill={color} opacity={shouldDim?0.1:1}/>
              <text x={11} y={isMobile?17:18} fill={shouldDim?"#2a2a3a":"#dde4f0"} fontSize={isMobile?9:10}
                fontFamily="DM Mono,monospace" fontWeight={isSel||isEdgeEndpoint?"700":"400"} opacity={shouldDim?0.2:1}>{truncName}</text>
              <text x={11} y={isMobile?30:33} fill={color} fontSize={isMobile?7.5:8.5}
                fontFamily="DM Mono,monospace" opacity={shouldDim?0.1:0.75}>{truncCat}</text>
              {(isHov||isSel)&&!shouldDim&&(
                <g transform={`translate(${NODE_W+6},${NODE_H/2-8})`}>
                  <rect x={0} y={0} width={52} height={16} rx={3} fill="#0d0d18" stroke={`${color}55`} strokeWidth={1}/>
                  <text x={26} y={11} fill={color} fontSize={8} fontFamily="DM Mono,monospace" textAnchor="middle">{fmtDate(m.date)}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Side Panel ─────────────────────────────────────────────────────────────────
function SidePanel({ milestone, allMilestones, categories, onClose, onNavigate }) {
  return (
    <div style={{ position:"fixed", top:0, right:0, bottom:0, width:"300px", borderLeft:"1px solid #1e1e2e", padding:"20px", background:"#0d0d18", overflowY:"auto", zIndex:100 }}>
      <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} onClose={onClose} onNavigate={onNavigate}/>
    </div>
  );
}

// ── Bottom Sheet ───────────────────────────────────────────────────────────────
function BottomSheet({ milestone, allMilestones, categories, onClose, onNavigate }) {
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"#00000077", zIndex:90 }}/>
      <div style={{ position:"fixed", left:0, right:0, bottom:0, background:"#0d0d18", borderTop:"1px solid #2d2d4e", borderRadius:"14px 14px 0 0", padding:"16px 20px 40px", zIndex:100, maxHeight:"78vh", overflowY:"auto" }}>
        <div style={{ width:"36px", height:"3px", background:"#2d2d4e", borderRadius:"2px", margin:"0 auto 16px" }}/>
        <Detail milestone={milestone} allMilestones={allMilestones} categories={categories} onClose={onClose} onNavigate={onNavigate}/>
      </div>
    </>
  );
}

// ── Detail Content ─────────────────────────────────────────────────────────────
function Detail({ milestone, allMilestones, categories, onClose, onNavigate }) {
  const color     = categories[milestone.category] || FALLBACK_COLOR;
  const priColor  = PRIORITIES[milestone.priority] || "#6b7280";
  const statColor = STATUSES[milestone.status]     || "#374151";
  const blockedByMs = (milestone.blockedBy||[]).map(id => allMilestones.find(m => m.id === id)).filter(Boolean);
  const unlocks     = allMilestones.filter(m => (m.blockedBy||[]).includes(milestone.id));

  const Chip = ({ label, col }) => (
    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:"3px", background:`${col}22`, border:`1px solid ${col}55`, fontSize:"9px", color:col, marginRight:"4px" }}>{label}</span>
  );

  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"10px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", color, fontWeight:"700" }}>{milestone.category}</div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:"18px", padding:"0", lineHeight:1 }}>✕</button>
      </div>
      <div style={{ fontSize:"15px", fontWeight:"700", color:"#f1f5f9", marginBottom:"6px", lineHeight:"1.4" }}>{milestone.name}</div>
      <div style={{ fontSize:"11px", color:"#6b7280", marginBottom:"10px" }}>
        {milestone.date ? new Date(milestone.date+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "No date"}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", marginBottom:"14px" }}>
        {milestone.priority && <Chip label={milestone.priority} col={priColor}/>}
        {milestone.status   && <Chip label={milestone.status}   col={statColor}/>}
        {milestone.effort != null && <Chip label={`Complexity: ${milestone.effort}`} col="#4b5563"/>}
        {milestone.owner    && <Chip label={`Owner: ${milestone.owner}`} col="#6b7280"/>}
      </div>
      {milestone.description && (
        <div style={{ fontSize:"11px", color:"#94a3b8", lineHeight:"1.8", marginBottom:"14px" }}>{milestone.description}</div>
      )}
      {milestone.notes && (
        <div style={{ marginBottom:"14px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", color:"#6b7280", marginBottom:"6px" }}>Notes</div>
          <div style={{ fontSize:"11px", color:"#cbd5e1", lineHeight:"1.8", background:"#1a1a2e", borderRadius:"5px", padding:"10px 12px", borderLeft:"2px solid #a78bfa", whiteSpace:"pre-wrap" }}>{milestone.notes}</div>
        </div>
      )}
      {blockedByMs.length > 0 && (
        <div style={{ marginBottom:"14px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", color:"#6b7280", marginBottom:"7px" }}>Blocked By</div>
          {blockedByMs.map(dep => (
            <div key={dep.id} onClick={()=>onNavigate(dep.id)} style={{ padding:"8px 10px", marginBottom:"4px", background:"#1a1a2e", borderRadius:"5px", fontSize:"11px", color:"#a78bfa", cursor:"pointer", borderLeft:`2px solid ${categories[dep.category]||FALLBACK_COLOR}` }}>{dep.name}</div>
          ))}
        </div>
      )}
      {unlocks.length > 0 && (
        <div>
          <div style={{ fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", color:"#6b7280", marginBottom:"7px" }}>Unlocks</div>
          {unlocks.map(m => (
            <div key={m.id} onClick={()=>onNavigate(m.id)} style={{ padding:"8px 10px", marginBottom:"4px", background:"#1a1a2e", borderRadius:"5px", fontSize:"11px", color:"#6ee7b7", cursor:"pointer", borderLeft:`2px solid ${categories[m.category]||FALLBACK_COLOR}` }}>{m.name}</div>
          ))}
        </div>
      )}
    </>
  );
}
