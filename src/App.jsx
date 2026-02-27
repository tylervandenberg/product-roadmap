import { useState, useMemo, useRef, useEffect } from "react";

const CATEGORIES = {
  "Definition": "#f59e0b",
  "Design & Prototype": "#3b82f6",
  "Compliance & Verification": "#8b5cf6",
  "Suppliers & Tooling": "#10b981",
  "Marketing": "#ec4899",
  "Testing & Validation": "#ef4444",
  "Launch Readiness": "#f97316",
  "Product Launch": "#06b6d4",
  "Refine & Scale": "#84cc16",
  "Retrospective": "#6b7280",
};

const MILESTONES = [
  // March
  { id: "m1", date: "2026-03-05", name: "Requirements & Constraints", category: "Definition", month: "March 2026", description: "PRD-lite with measurable must/should/won't, incl. materials + dishwasher/heated dry + boil intent.", blockedBy: ["Problem Definition", "Target User & Use Case"] },
  { id: "m2", date: "2026-03-09", name: "Manufacturing Choices", category: "Definition", month: "March 2026", description: "LSR confirmed + provisional stainless process candidates + assembly approach assumptions.", blockedBy: ["m1"] },
  { id: "m3", date: "2026-03-11", name: "Cost & Price", category: "Definition", month: "March 2026", description: "MSRP + COGS ceiling + margin target + cost-down decision tree.", blockedBy: ["m1"] },
  { id: "m4", date: "2026-03-12", name: "Regulatory Scope Lock", category: "Compliance & Verification", month: "March 2026", description: "What compliance expectations apply (children's product expectations + food-contact evidence approach).", blockedBy: ["m1"] },
  { id: "m5", date: "2026-03-12", name: "Concept Lock", category: "Design & Prototype", month: "March 2026", description: "Winning concept selected (cleaning + ergonomics + manufacturability).", blockedBy: ["m1", "m2"] },
  { id: "m6", date: "2026-03-14", name: "Claims & Labeling Guardrails", category: "Compliance & Verification", month: "March 2026", description: "Allowed vs banned claims + draft care/warnings rules.", blockedBy: ["m4"] },
  { id: "m7", date: "2026-03-14", name: "Messaging Lock + Objection Bank", category: "Marketing", month: "March 2026", description: "10-sec pitch + pillars + objection responses, aligned to claim guardrails.", blockedBy: ["m6"] },
  { id: "m8", date: "2026-03-14", name: "Definition Packet Freeze", category: "Definition", month: "March 2026", description: "All definition decisions packaged and frozen enough for handoff.", blockedBy: ["m1", "m2", "m3", "m4"] },
  { id: "m9", date: "2026-03-17", name: "Food Path & Materials Lock", category: "Design & Prototype", month: "March 2026", description: "Food-contact surfaces defined + silicone hardness/color + stainless grade/finish.", blockedBy: ["m5", "m4"] },
  { id: "m10", date: "2026-03-17", name: "Food-Contact Evidence Plan", category: "Compliance & Verification", month: "March 2026", description: "Exact supplier evidence required for colored silicone compound + stainless.", blockedBy: ["m4", "m6"] },
  { id: "m11", date: "2026-03-20", name: "RFQ Pack Sent", category: "Suppliers & Tooling", month: "March 2026", description: "Suppliers get CAD/drawings/specs/docs requirements to quote properly.", blockedBy: ["m9"] },
  { id: "m12", date: "2026-03-21", name: "Waitlist Funnel Live (v1)", category: "Marketing", month: "March 2026", description: "Landing page + capture + welcome + basic nurture + tracking.", blockedBy: ["m7"] },
  { id: "m13", date: "2026-03-21", name: "Supplier Compliance Packet Request", category: "Compliance & Verification", month: "March 2026", description: "Key supplier docs in hand or missing-doc tracker with owners/dates.", blockedBy: ["m10"] },
  { id: "m14", date: "2026-03-25", name: "Tolerance & Fit Strategy", category: "Design & Prototype", month: "March 2026", description: "Numeric targets for wobble/torque/back-off/retention.", blockedBy: ["m5"] },
  { id: "m15", date: "2026-03-25", name: "Verification Test Matrix + Pass/Fail", category: "Compliance & Verification", month: "March 2026", description: "Test plan including dishwasher heated dry + boil, staining/odor, interface torque/wobble.", blockedBy: ["m6", "m14"] },
  { id: "m16", date: "2026-03-28", name: "DFM Pass", category: "Design & Prototype", month: "March 2026", description: "LSR DFM readiness (gates/vents/shutoffs/flash risk/cosmetic zones) + stainless manufacturability notes.", blockedBy: ["m14"] },

  // April
  { id: "m17", date: "2026-04-04", name: "Design Freeze v1", category: "Design & Prototype", month: "April 2026", description: "Quote/tooling kickoff-ready CAD + drawings + change log.", blockedBy: ["m16"] },
  { id: "m18", date: "2026-04-04", name: "Compliance Plan Freeze v1", category: "Compliance & Verification", month: "April 2026", description: "Complete compliance planning packet (scope, guardrails, evidence tracker, test plan, lab plan).", blockedBy: ["m4", "m6", "m10", "m13", "m15"] },
  { id: "m19", date: "2026-04-10", name: "Supplier Lock", category: "Suppliers & Tooling", month: "April 2026", description: "Suppliers chosen + terms + tool ownership + revision policy in writing.", blockedBy: ["m17"] },
  { id: "m20", date: "2026-04-17", name: "Color Standard Lock", category: "Suppliers & Tooling", month: "April 2026", description: "Objective color target + acceptance method + lot consistency plan.", blockedBy: ["m19", "m6"] },
  { id: "m21", date: "2026-04-20", name: "Tooling Kickoff (PO + Schedule)", category: "Suppliers & Tooling", month: "April 2026", description: "Tooling PO placed + T0/T1 dates on calendar + revision allowances clear.", blockedBy: ["m19", "m20"] },
  { id: "m22", date: "2026-04-30", name: "Tool Samples Plan Confirmed", category: "Suppliers & Tooling", month: "April 2026", description: "Confirm expected T1 delivery timing and shipping plan.", blockedBy: ["m21"] },

  // May
  { id: "m23", date: "2026-05-01", name: "Tool Design Review Approval", category: "Suppliers & Tooling", month: "May 2026", description: "You approve gate/vent/parting/shutoff choices before steel cut.", blockedBy: ["m21"] },
  { id: "m24", date: "2026-05-03", name: "Drop Store Setup (Shopify skeleton)", category: "Marketing", month: "May 2026", description: "Store foundation: PDP template, policies, shipping profiles, notify-me.", blockedBy: ["m12", "m6"] },
  { id: "m25", date: "2026-05-10", name: "Test Plan Freeze (EVT/DVT/PVT)", category: "Testing & Validation", month: "May 2026", description: "The master test plan with cycle counts + pass/fail, incl dishwasher heated dry + boil.", blockedBy: ["m15", "m17"] },
  { id: "m26", date: "2026-05-22", name: "EVT Complete + Baseline Performance", category: "Testing & Validation", month: "May 2026", description: "It works end-to-end; baseline torque/wobble/effort recorded.", blockedBy: ["m25"] },

  // June
  { id: "m27", date: "2026-06-07", name: "Interface & Retention Validation", category: "Testing & Validation", month: "June 2026", description: "Wobble/torque/back-off/retention meets thresholds across multiple units.", blockedBy: ["m26"] },
  { id: "m28", date: "2026-06-14", name: "Cleaning & Durability Cycling PASS", category: "Testing & Validation", month: "June 2026", description: "Dishwasher (heated dry ON) + boil cycles + stain/odor results documented.", blockedBy: ["m26", "m25"] },
  { id: "m29", date: "2026-06-28", name: "Tool Samples Received (T1)", category: "Suppliers & Tooling", month: "June 2026", description: "Production-intent parts physically in hand.", blockedBy: ["m21", "m23"] },

  // July
  { id: "m30", date: "2026-07-02", name: "DVT Freeze (Design Freeze v2)", category: "Testing & Validation", month: "July 2026", description: "All high severity issues closed; design stable for pilot run.", blockedBy: ["m28", "m27"] },
  { id: "m31", date: "2026-07-05", name: "Launch Creative Kit", category: "Marketing", month: "July 2026", description: "Hero video + hooks + photo set + b-roll library ready for launch week.", blockedBy: ["m24"] },
  { id: "m32", date: "2026-07-09", name: "PVT / Pilot Run Plan + Yield Targets", category: "Testing & Validation", month: "July 2026", description: "Pilot plan with measurable yield and defect criteria.", blockedBy: ["m30", "m23"] },
  { id: "m33", date: "2026-07-18", name: "Pilot Run Complete + Validation Summary", category: "Testing & Validation", month: "July 2026", description: "Yield/quality/assembly time are real; exit report says go/no-go.", blockedBy: ["m32"] },
  { id: "m34", date: "2026-07-19", name: "Drop #1 Page + Email/SMS Sequence Final", category: "Marketing", month: "July 2026", description: "Drop page + launch sequences scheduled and tested.", blockedBy: ["m31", "m24"] },
  { id: "m35", date: "2026-07-20", name: "Launch Inventory Plan + Drop Schedule Lock", category: "Launch Readiness", month: "July 2026", description: "Drop quantity, holdbacks, ship promise, drop date/time committed.", blockedBy: ["m33"] },
  { id: "m36", date: "2026-07-24", name: "Final Packaging + IFU Lock", category: "Launch Readiness", month: "July 2026", description: "Packaging and instructions reflect validated dishwasher/heated dry + boil safe conditions.", blockedBy: ["m28", "m6"] },
  { id: "m37", date: "2026-07-29", name: "Final QC Plan", category: "Launch Readiness", month: "July 2026", description: "Final go/no-go functional checks and incoming part inspections.", blockedBy: ["m33"] },

  // August
  { id: "m38", date: "2026-08-01", name: "Shopify Store Finalization", category: "Launch Readiness", month: "August 2026", description: "PDP/FAQ/policies/shipping/notify-me + post-purchase flows fully working.", blockedBy: ["m24", "m36"] },
  { id: "m39", date: "2026-08-08", name: "Dress Rehearsal (End-to-End)", category: "Launch Readiness", month: "August 2026", description: "Test orders through checkout → pack → ship → support → return.", blockedBy: ["m38", "m37"] },
  { id: "m40", date: "2026-08-12", name: "Inventory Packed + Ready to Ship", category: "Launch Readiness", month: "August 2026", description: "Units assembled/QC'd/packed or staged to ship same/next day.", blockedBy: ["m37", "m36"] },
  { id: "m41", date: "2026-08-15", name: "Go/No-Go Review + Contingency Plan", category: "Launch Readiness", month: "August 2026", description: "Launch decision + fallback messaging for delay/sellout/partial drop.", blockedBy: ["m39", "m40"] },
  { id: "m42", date: "2026-08-17", name: "Soft Launch Open (Waitlist Early Access)", category: "Product Launch", month: "August 2026", description: "Controlled release to waitlist; monitor problems.", blockedBy: ["m41"] },
  { id: "m43", date: "2026-08-20", name: "Top 3 Friction Points Identified", category: "Product Launch", month: "August 2026", description: "Evidence-based top issues (conversion or tickets).", blockedBy: ["m42"] },
  { id: "m44", date: "2026-08-22", name: "Quick Fix Release v1", category: "Product Launch", month: "August 2026", description: "Update PDP/FAQ/support scripts based on real issues.", blockedBy: ["m43"] },
  { id: "m45", date: "2026-08-24", name: "Full Launch Push (Public Drop)", category: "Product Launch", month: "August 2026", description: "Public push with tracking intact.", blockedBy: ["m44"] },
  { id: "m46", date: "2026-08-29", name: "Launch Metrics Summary + Go-Forward Decision", category: "Product Launch", month: "August 2026", description: "Decide Drop #2, priorities, and what to change based on numbers.", blockedBy: ["m45"] },
  { id: "m47", date: "2026-08-31", name: "Metrics + Operating Cadence (30 Days)", category: "Refine & Scale", month: "August 2026", description: "Weekly rhythm for quality/supply/marketing/support.", blockedBy: ["m46"] },
  { id: "m48", date: "2026-08-31", name: "Defect Pareto + QC Tightening Plan", category: "Refine & Scale", month: "August 2026", description: "Rank defect causes and update inspection/QC to catch them.", blockedBy: ["m46"] },
  { id: "m49", date: "2026-08-31", name: "Next Drop Plan (Qty + Date + Constraints)", category: "Refine & Scale", month: "August 2026", description: "A realistic Drop #2 plan aligned to lead times and yield.", blockedBy: ["m46"] },
  { id: "m50", date: "2026-08-31", name: "Data Pack Assembled", category: "Retrospective", month: "August 2026", description: "All facts in one place (timeline, yield, defects, returns, marketing).", blockedBy: ["m46"] },

  // September
  { id: "m51", date: "2026-09-02", name: "Quality & Returns Postmortem", category: "Retrospective", month: "September 2026", description: "Why defects/returns happened and why QC missed them.", blockedBy: ["m50"] },
  { id: "m52", date: "2026-09-07", name: "Action Register + Owners + Dates", category: "Retrospective", month: "September 2026", description: "Top 10 actions assigned with dates and metrics.", blockedBy: ["m51", "m50"] },
];

const MONTHS = ["March 2026", "April 2026", "May 2026", "June 2026", "July 2026", "August 2026", "September 2026"];
const MONTH_STARTS = {
  "March 2026": new Date("2026-03-01"),
  "April 2026": new Date("2026-04-01"),
  "May 2026": new Date("2026-05-01"),
  "June 2026": new Date("2026-06-01"),
  "July 2026": new Date("2026-07-01"),
  "August 2026": new Date("2026-08-01"),
  "September 2026": new Date("2026-09-01"),
};
const PROJECT_START = new Date("2026-03-01");
const PROJECT_END = new Date("2026-09-30");
const TOTAL_DAYS = (PROJECT_END - PROJECT_START) / (1000 * 60 * 60 * 24);

function dayOffset(dateStr) {
  return (new Date(dateStr) - PROJECT_START) / (1000 * 60 * 60 * 24);
}

function pct(dateStr) {
  return (dayOffset(dateStr) / TOTAL_DAYS) * 100;
}

export default function GanttApp() {
  const [view, setView] = useState("gantt"); // "gantt" | "deps"
  const [search, setSearch] = useState("");
  const [filterPhase, setFilterPhase] = useState("All");
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const svgRef = useRef(null);

  const phases = ["All", ...Object.keys(CATEGORIES)];

  const filtered = useMemo(() => {
    return MILESTONES.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchPhase = filterPhase === "All" || m.category === filterPhase;
      return matchSearch && matchPhase;
    });
  }, [search, filterPhase]);

  // Build dep chain highlight
  const getChain = (id) => {
    if (!id) return new Set();
    const chain = new Set([id]);
    const addDeps = (mid) => {
      const m = MILESTONES.find(x => x.id === mid);
      if (!m) return;
      m.blockedBy.forEach(dep => {
        const depM = MILESTONES.find(x => x.id === dep);
        if (depM && !chain.has(dep)) {
          chain.add(dep);
          addDeps(dep);
        }
      });
    };
    const addDependents = (mid) => {
      MILESTONES.forEach(m => {
        if (m.blockedBy.includes(mid) && !chain.has(m.id)) {
          chain.add(m.id);
          addDependents(m.id);
        }
      });
    };
    addDeps(id);
    addDependents(id);
    return chain;
  };

  const chain = useMemo(() => getChain(hoveredId || selectedId), [hoveredId, selectedId]);
  const activeId = hoveredId || selectedId;

  const selectedMilestone = selectedId ? MILESTONES.find(m => m.id === selectedId) : null;

  return (
    <div style={{
      fontFamily: "'DM Mono', 'Courier New', monospace",
      background: "#0a0a0f",
      minHeight: "100vh",
      color: "#e2e8f0",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1e1e2e",
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0d0d18",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div>
          <div style={{ fontSize: "11px", letterSpacing: "0.15em", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Product Roadmap</div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#f1f5f9", letterSpacing: "-0.02em" }}>Mar → Sep 2026</div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "#1a1a2e", borderRadius: "6px", padding: "2px", border: "1px solid #2d2d4e" }}>
            {[["gantt", "Timeline"], ["deps", "Dependency Map"]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "5px 14px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                letterSpacing: "0.05em",
                fontFamily: "inherit",
                fontWeight: v === view ? "700" : "400",
                background: v === view ? "#3b3b6b" : "transparent",
                color: v === view ? "#a78bfa" : "#6b7280",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        padding: "12px 28px",
        display: "flex",
        gap: "10px",
        alignItems: "center",
        borderBottom: "1px solid #1e1e2e",
        flexWrap: "wrap",
        background: "#0d0d18",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search milestones..."
          style={{
            background: "#1a1a2e",
            border: "1px solid #2d2d4e",
            borderRadius: "5px",
            padding: "6px 12px",
            color: "#e2e8f0",
            fontSize: "11px",
            fontFamily: "inherit",
            outline: "none",
            width: "200px",
          }}
        />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {phases.map(p => (
            <button key={p} onClick={() => setFilterPhase(p)} style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: `1px solid ${filterPhase === p ? (CATEGORIES[p] || "#a78bfa") : "#2d2d4e"}`,
              background: filterPhase === p ? `${CATEGORIES[p] || "#a78bfa"}22` : "transparent",
              color: filterPhase === p ? (CATEGORIES[p] || "#a78bfa") : "#6b7280",
              fontSize: "10px",
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
              transition: "all 0.1s",
            }}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 120px)" }}>
        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {view === "gantt" ? (
            <GanttView milestones={filtered} allMilestones={MILESTONES} chain={chain} activeId={activeId}
              onHover={setHoveredId} onSelect={setSelectedId} selectedId={selectedId} />
          ) : (
            <DepsView milestones={filtered} allMilestones={MILESTONES} chain={chain} activeId={activeId}
              onHover={setHoveredId} onSelect={setSelectedId} selectedId={selectedId} />
          )}
        </div>

        {/* Detail panel */}
        {selectedMilestone && (
          <div style={{
            width: "280px",
            borderLeft: "1px solid #1e1e2e",
            padding: "20px",
            background: "#0d0d18",
            overflowY: "auto",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div style={{
                fontSize: "9px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: CATEGORIES[selectedMilestone.category],
                fontWeight: "700",
              }}>{selectedMilestone.category}</div>
              <button onClick={() => setSelectedId(null)} style={{
                background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "14px", padding: "0"
              }}>✕</button>
            </div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#f1f5f9", marginBottom: "6px", lineHeight: "1.4" }}>
              {selectedMilestone.name}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "12px" }}>
              {new Date(selectedMilestone.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.7", marginBottom: "16px" }}>
              {selectedMilestone.description}
            </div>
            {selectedMilestone.blockedBy.length > 0 && (
              <div>
                <div style={{ fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: "8px" }}>Blocked By</div>
                {selectedMilestone.blockedBy.map(dep => {
                  const depM = MILESTONES.find(m => m.id === dep);
                  return depM ? (
                    <div key={dep} onClick={() => setSelectedId(dep)} style={{
                      padding: "6px 8px",
                      marginBottom: "4px",
                      background: "#1a1a2e",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#a78bfa",
                      cursor: "pointer",
                      borderLeft: `2px solid ${CATEGORIES[depM.category]}`,
                    }}>{depM.name}</div>
                  ) : null;
                })}
              </div>
            )}
            {/* What this unlocks */}
            {(() => {
              const unlocks = MILESTONES.filter(m => m.blockedBy.includes(selectedMilestone.id));
              return unlocks.length > 0 ? (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: "8px" }}>Unlocks</div>
                  {unlocks.map(m => (
                    <div key={m.id} onClick={() => setSelectedId(m.id)} style={{
                      padding: "6px 8px",
                      marginBottom: "4px",
                      background: "#1a1a2e",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#6ee7b7",
                      cursor: "pointer",
                      borderLeft: `2px solid ${CATEGORIES[m.category]}`,
                    }}>{m.name}</div>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function GanttView({ milestones, allMilestones, chain, activeId, onHover, onSelect, selectedId }) {
  const monthGroups = MONTHS.map(month => ({
    month,
    items: milestones.filter(m => m.month === month),
  })).filter(g => g.items.length > 0);

  // Month header widths
  const monthOffsets = MONTHS.map(month => {
    const start = MONTH_STARTS[month];
    return (start - PROJECT_START) / (1000 * 60 * 60 * 24) / TOTAL_DAYS * 100;
  });

  return (
    <div>
      {/* Timeline header */}
      <div style={{ position: "relative", height: "28px", marginBottom: "4px", marginLeft: "240px" }}>
        {MONTHS.map((month, i) => (
          <div key={month} style={{
            position: "absolute",
            left: `${monthOffsets[i]}%`,
            fontSize: "9px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#4b5563",
            whiteSpace: "nowrap",
          }}>{month.split(" ")[0]}</div>
        ))}
        {/* Today line */}
        {(() => {
          const today = new Date("2026-02-26");
          const tp = (today - PROJECT_START) / (PROJECT_END - PROJECT_START) * 100;
          return tp >= 0 && tp <= 100 ? (
            <div style={{ position: "absolute", left: `${tp}%`, top: 0, bottom: 0, width: "1px", background: "#f59e0b44" }} />
          ) : null;
        })()}
      </div>

      {monthGroups.map(({ month, items }) => (
        <div key={month} style={{ marginBottom: "20px" }}>
          {/* Month label */}
          <div style={{
            fontSize: "10px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#374151",
            marginBottom: "6px",
            fontWeight: "700",
            paddingLeft: "4px",
            borderLeft: "2px solid #1e1e2e",
          }}>{month}</div>

          {items.map(m => {
            const isInChain = activeId ? chain.has(m.id) : true;
            const isSelected = m.id === selectedId;
            const isHovered = m.id === activeId;
            const color = CATEGORIES[m.category];
            const xPos = pct(m.date);

            return (
              <div key={m.id}
                onMouseEnter={() => onHover(m.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(m.id === selectedId ? null : m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "3px",
                  cursor: "pointer",
                  opacity: activeId && !isInChain ? 0.15 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {/* Label */}
                <div style={{
                  width: "235px",
                  flexShrink: 0,
                  fontSize: "10px",
                  color: isSelected ? color : isInChain && activeId ? "#e2e8f0" : "#94a3b8",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  paddingRight: "10px",
                  fontWeight: isSelected || isHovered ? "700" : "400",
                  transition: "all 0.1s",
                }}>{m.name}</div>

                {/* Bar area */}
                <div style={{ flex: 1, position: "relative", height: "22px" }}>
                  {/* Grid lines */}
                  {MONTHS.map((mo, i) => (
                    <div key={mo} style={{
                      position: "absolute",
                      left: `${monthOffsets[i]}%`,
                      top: 0,
                      bottom: 0,
                      width: "1px",
                      background: "#1a1a2e",
                    }} />
                  ))}

                  {/* Milestone diamond */}
                  <div style={{
                    position: "absolute",
                    left: `${xPos}%`,
                    top: "50%",
                    transform: "translate(-50%, -50%) rotate(45deg)",
                    width: isSelected || isHovered ? "12px" : "9px",
                    height: isSelected || isHovered ? "12px" : "9px",
                    background: isSelected || isHovered ? color : `${color}bb`,
                    boxShadow: isSelected || isHovered ? `0 0 10px ${color}88` : "none",
                    transition: "all 0.15s",
                    zIndex: 2,
                  }} />

                  {/* Category dot */}
                  <div style={{
                    position: "absolute",
                    left: `${xPos}%`,
                    top: "50%",
                    transform: "translate(8px, -50%)",
                    fontSize: "8px",
                    color: `${color}88`,
                    whiteSpace: "nowrap",
                    letterSpacing: "0.05em",
                  }}>
                    {isHovered || isSelected ? m.category : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #1e1e2e" }}>
        {Object.entries(CATEGORIES).map(([cat, color]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "8px", height: "8px", background: color, transform: "rotate(45deg)" }} />
            <span style={{ fontSize: "9px", color: "#4b5563", letterSpacing: "0.05em" }}>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepsView({ milestones, allMilestones, chain, activeId, onHover, onSelect, selectedId }) {
  const filteredIds = new Set(milestones.map(m => m.id));

  // Layout: assign columns by date, rows by category
  const sorted = [...milestones].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Simple force-ish layout: bucket by week
  const weeks = {};
  sorted.forEach(m => {
    const d = new Date(m.date);
    const weekKey = Math.floor((d - PROJECT_START) / (7 * 24 * 60 * 60 * 1000));
    if (!weeks[weekKey]) weeks[weekKey] = [];
    weeks[weekKey].push(m);
  });

  const COLS = Object.keys(weeks).sort((a, b) => a - b);
  const NODE_W = 130;
  const NODE_H = 38;
  const COL_GAP = 160;
  const ROW_GAP = 50;

  const positions = {};
  COLS.forEach((col, ci) => {
    weeks[col].forEach((m, ri) => {
      positions[m.id] = {
        x: ci * COL_GAP + 10,
        y: ri * ROW_GAP + 10,
      };
    });
  });

  const totalW = COLS.length * COL_GAP + NODE_W + 20;
  const totalH = Math.max(...Object.values(positions).map(p => p.y)) + NODE_H + 20;

  return (
    <div style={{ overflowX: "auto", overflowY: "auto" }}>
      <svg width={totalW} height={totalH} style={{ display: "block" }}>
        {/* Draw dependency arrows */}
        {milestones.map(m => (
          m.blockedBy.map(depId => {
            const depM = allMilestones.find(x => x.id === depId);
            if (!depM || !filteredIds.has(depId)) return null;
            const from = positions[depId];
            const to = positions[m.id];
            if (!from || !to) return null;
            const isActive = activeId ? (chain.has(m.id) && chain.has(depId)) : false;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const cx = (x1 + x2) / 2;
            return (
              <g key={`${depId}-${m.id}`}>
                <path
                  d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke={isActive ? "#a78bfa" : "#1e1e2e"}
                  strokeWidth={isActive ? 1.5 : 1}
                  markerEnd={isActive ? "url(#arrowActive)" : "url(#arrow)"}
                  opacity={activeId && !isActive ? 0.2 : 1}
                />
              </g>
            );
          })
        ))}

        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#2d2d4e" />
          </marker>
          <marker id="arrowActive" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#a78bfa" />
          </marker>
        </defs>

        {/* Draw nodes */}
        {milestones.map(m => {
          const pos = positions[m.id];
          if (!pos) return null;
          const color = CATEGORIES[m.category];
          const isInChain = activeId ? chain.has(m.id) : true;
          const isSelected = m.id === selectedId;
          const isHovered = m.id === activeId;

          return (
            <g key={m.id} transform={`translate(${pos.x}, ${pos.y})`}
              onMouseEnter={() => onHover(m.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(m.id === selectedId ? null : m.id)}
              style={{ cursor: "pointer" }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx="4"
                fill={isSelected || isHovered ? `${color}22` : "#0d0d18"}
                stroke={isSelected || isHovered ? color : activeId && !isInChain ? "#1a1a2e" : "#2d2d4e"}
                strokeWidth={isSelected || isHovered ? 1.5 : 1}
                opacity={activeId && !isInChain ? 0.3 : 1}
              />
              <rect width="3" height={NODE_H} rx="2" fill={color} opacity={isInChain || !activeId ? 1 : 0.2} />
              <text
                x="10"
                y="14"
                fill={isInChain || !activeId ? "#e2e8f0" : "#374151"}
                fontSize="9"
                fontFamily="DM Mono, monospace"
                fontWeight={isSelected || isHovered ? "700" : "400"}
              >
                {m.name.length > 18 ? m.name.substring(0, 17) + "…" : m.name}
              </text>
              <text x="10" y="27" fill={color} fontSize="8" fontFamily="DM Mono, monospace" opacity="0.8">
                {m.category.length > 20 ? m.category.substring(0, 19) + "…" : m.category}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
