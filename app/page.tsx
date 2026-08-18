"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "Ready" | "In progress" | "Review" | "Done";
type View = "overview" | "quests" | "timeline" | "milestones";
type Card = { id: number; title: string; description: string; tag: string; owner: string; points: number; color: string; status: Status; project: string; due: string };

const SUPABASE_URL = "https://duddukvihvuoqawsoqus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TcigjkGnxplktO6uSngk8w_UETJmWR6";

type SupabaseCard = {
  id: number;
  title: string;
  description: string;
  tag: string;
  owner_initials: string;
  points: number;
  color: string;
  status: Status;
  due_label: string;
  questdeck_projects: { name: string };
};

const initialCards: Card[] = [
  { id: 1, title: "Tune player movement", description: "Make traversal feel crisp and responsive before the next playtest.", tag: "GAMEPLAY", owner: "MK", points: 3, color: "violet", status: "In progress", project: "Project Nightfall", due: "Today" },
  { id: 2, title: "Forest ambience pass", description: "Layer environmental loops for the northern forest biome.", tag: "AUDIO", owner: "JL", points: 2, color: "mint", status: "Ready", project: "Project Nightfall", due: "Today" },
  { id: 3, title: "Boss arena concept", description: "Explore three silhouettes and arena lighting directions.", tag: "ART", owner: "AS", points: 5, color: "coral", status: "Review", project: "Project Nightfall", due: "Tomorrow" },
  { id: 4, title: "Controller remapping", description: "Allow players to fully remap gamepad controls.", tag: "ENGINEERING", owner: "NK", points: 5, color: "blue-card", status: "Ready", project: "Project Nightfall", due: "Aug 22" },
  { id: 5, title: "Steam page refresh", description: "Update key art, capsule copy, and screenshots for the showcase.", tag: "MARKETING", owner: "JR", points: 3, color: "amber-card", status: "In progress", project: "Marketing", due: "Aug 21" },
  { id: 6, title: "Chapter two dialogue", description: "Final narrative edit and implementation notes.", tag: "NARRATIVE", owner: "JK", points: 2, color: "rose-card", status: "Review", project: "Project Nightfall", due: "Aug 23" },
  { id: 7, title: "Playtest build 0.8", description: "Lock the candidate build and verify critical paths.", tag: "RELEASE", owner: "MK", points: 8, color: "violet", status: "Done", project: "Project Nightfall", due: "Aug 16" },
  { id: 8, title: "New starter checklist", description: "Document local setup and first-week studio rituals.", tag: "STUDIO", owner: "AS", points: 1, color: "mint", status: "Done", project: "Studio Ops", due: "Aug 15" },
];

const projects = [
  { name: "Project Nightfall", count: 24, color: "purple" },
  { name: "Marketing", count: 8, color: "yellow" },
  { name: "Studio Ops", count: 4, color: "blue" },
];

const productionStages: Status[] = ["Ready", "In progress", "Review", "Done"];

const timelineDays = ["Mon 17", "Tue 18", "Wed 19", "Thu 20", "Fri 21", "Sat 22", "Sun 23", "Mon 24", "Tue 25", "Wed 26", "Thu 27", "Fri 28", "Sat 29", "Sun 30"];
const timelineLanes = [
  { team: "DESIGN", owner: "MK", tone: "violet", bars: [{ title: "Movement tuning", start: 1, span: 3, progress: 74 }, { title: "Boss encounter", start: 5, span: 4, progress: 38 }, { title: "Difficulty pass", start: 10, span: 3, progress: 0 }] },
  { team: "ART", owner: "AS", tone: "coral", bars: [{ title: "Forest props", start: 0, span: 4, progress: 100 }, { title: "Arena concepts", start: 4, span: 5, progress: 62 }, { title: "Demo polish", start: 10, span: 4, progress: 0 }] },
  { team: "CODE", owner: "NK", tone: "blue-card", bars: [{ title: "Input remapping", start: 2, span: 4, progress: 55 }, { title: "Save system QA", start: 7, span: 3, progress: 15 }, { title: "Build candidate", start: 11, span: 3, progress: 0 }] },
  { team: "AUDIO", owner: "JL", tone: "mint", bars: [{ title: "Forest ambience", start: 1, span: 5, progress: 81 }, { title: "Boss mix", start: 8, span: 4, progress: 20 }] },
];

function QuestCard({ card, onOpen, compact = false }: { card: Card; onOpen: (card: Card) => void; compact?: boolean }) {
  return <button className={`quest-card ${compact ? "compact" : ""}`} onClick={() => onOpen(card)} aria-label={`Open ${card.title}`}>
    <div className={`card-accent ${card.color}`}><span>{card.tag}</span><b>{card.points}</b></div>
    <div className="card-body"><small>{card.project.toUpperCase()}</small><h4>{card.title}</h4>{!compact && <p>{card.description}</p>}<div className="card-footer"><span className="avatar">{card.owner}</span><span>◷ {card.due}</span><span>◌ {card.id % 4}</span></div></div>
  </button>;
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [dataSource, setDataSource] = useState<"connecting" | "supabase" | "local">("connecting");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("All projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("questdeck-cards");
    let localCards: Card[] = [];
    if (stored) { try { localCards = JSON.parse(stored); setCards(localCards); } catch {} }

    fetch(`${SUPABASE_URL}/rest/v1/questdeck_cards?select=id,title,description,tag,owner_initials,points,color,status,due_label,questdeck_projects(name)&order=id.asc`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    })
      .then(response => {
        if (!response.ok) throw new Error("Supabase request failed");
        return response.json() as Promise<SupabaseCard[]>;
      })
      .then(remoteCards => {
        const localById = new Map(localCards.map(card => [card.id, card]));
        const remoteIds = new Set(remoteCards.map(card => card.id));
        const mapped = remoteCards.map(card => localById.get(card.id) ?? ({
          id: card.id,
          title: card.title,
          description: card.description,
          tag: card.tag,
          owner: card.owner_initials,
          points: card.points,
          color: card.color,
          status: card.status,
          project: card.questdeck_projects.name,
          due: card.due_label,
        } satisfies Card));
        setCards([...mapped, ...localCards.filter(card => !remoteIds.has(card.id))]);
        setDataSource("supabase");
      })
      .catch(() => setDataSource("local"));
  }, []);
  useEffect(() => { window.localStorage.setItem("questdeck-cards", JSON.stringify(cards)); }, [cards]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const filtered = useMemo(() => cards.filter(card => {
    const matchesQuery = `${card.title} ${card.description} ${card.tag} ${card.project}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (project === "All projects" || card.project === project);
  }), [cards, query, project]);

  function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newCard: Card = {
      id: Date.now(), title: String(data.get("title")), description: String(data.get("description") || "A newly forged quest, ready for the team."),
      tag: String(data.get("tag")), owner: "JK", points: Number(data.get("points")), color: "violet", status: "Ready", project: String(data.get("project")), due: "New",
    };
    setCards(prev => [newCard, ...prev]); setCreateOpen(false); setToast("Card added to your deck"); setView("quests");
  }

  function updateStatus(card: Card, status: Status) {
    setCards(prev => prev.map(item => item.id === card.id ? { ...item, status } : item));
    setSelected({ ...card, status }); setToast(`Moved to ${status}`);
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">Q</span><span>Questdeck</span></div>
      <button className="workspace"><span className="workspace-icon">SF</span><span><small>WORKSPACE</small>Starfall Studio</span><b>⌄</b></button>
      <nav>
        <p className="nav-label">PLAN</p>
        <button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><span>⌂</span> Overview</button>
        <button className={`nav-item ${view === "quests" ? "active" : ""}`} onClick={() => setView("quests")}><span>▤</span> Production board <i>{cards.filter(c => c.status !== "Done").length}</i></button>
        <button className={`nav-item ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}><span>↔</span> Timeline</button>
        <button className={`nav-item ${view === "milestones" ? "active" : ""}`} onClick={() => setView("milestones")}><span>◎</span> Milestones</button>
        <p className="nav-label">PROJECTS</p>
        {projects.map(item => <button className="nav-item" key={item.name} onClick={() => { setProject(item.name); setView("quests"); }}><span className={`dot ${item.color}`} /> {item.name}<i>{item.count}</i></button>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item"><span>?</span> Help & shortcuts</button><div className="profile"><span>JK</span><div><b>Jamie Kim</b><small>Producer</small></div><button aria-label="Profile options">•••</button></div></div>
    </aside>

    <section className="workspace-main">
      <header className="topbar">
        <label className="search">⌕ <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cards, decks, people…" aria-label="Search cards"/><kbd>⌘ K</kbd></label>
        <span className={`data-source ${dataSource}`}><i />{dataSource === "supabase" ? "Supabase live" : dataSource === "local" ? "Local mode" : "Connecting"}</span>
        <button className="icon-button" aria-label="Activity">◌</button><button className="icon-button" aria-label="Notifications">♧<em>3</em></button>
        <button className="create-button" onClick={() => setCreateOpen(true)}>＋ Create card</button>
      </header>

      {view === "overview" && <div className="content">
        <div className="welcome"><div><p>MONDAY, AUGUST 18</p><h1>Good morning, Jamie <span>✦</span></h1><h2>Here’s what’s moving in your world.</h2></div><div className="team"><span>MK</span><span>JL</span><span>AS</span><span>+4</span></div></div>
        <div className="stats">
          <article><span className="stat-icon purple-bg">✓</span><div><small>COMPLETED THIS WEEK</small><strong>{cards.filter(c => c.status === "Done").length + 16}</strong><p><b>↑ 24%</b> from last week</p></div></article>
          <article><span className="stat-icon coral-bg">◷</span><div><small>IN PROGRESS</small><strong>{cards.filter(c => c.status === "In progress").length + 10}</strong><p>Across 3 projects</p></div></article>
          <article><span className="stat-icon amber-bg">!</span><div><small>NEEDS ATTENTION</small><strong>5</strong><p><b className="warn">2 overdue</b></p></div></article>
        </div>
        <div className="section-heading"><div><h3>Your hand</h3><p>Cards ready for you to play next.</p></div><button onClick={() => setView("quests")}>View all <span>→</span></button></div>
        <div className="card-grid hand-grid">{filtered.filter(card => card.status !== "Done").slice(0, 3).map(card => <QuestCard card={card} onOpen={setSelected} key={card.id}/>)}</div>
        <div className="overview-bottom">
          <section className="milestone-preview"><div className="mini-title"><div><small>NEXT MILESTONE</small><h3>Festival demo</h3></div><b>12 days</b></div><div className="progress-track"><span style={{width:"68%"}}/></div><p><b>34 of 50 cards</b> completed <span>68%</span></p><div className="milestone-tags"><i>Core loop ✓</i><i>Forest biome</i><i>Demo polish</i></div></section>
          <section className="activity"><div className="mini-title"><div><small>LIVE PULSE</small><h3>Studio activity</h3></div><button>•••</button></div><ul><li><span className="pulse-avatar lilac">AS</span><p><b>Alex</b> moved <strong>Boss arena concept</strong> to Review<small>18 minutes ago</small></p></li><li><span className="pulse-avatar aqua">JL</span><p><b>Jules</b> completed <strong>Cave reverb zones</strong><small>42 minutes ago</small></p></li><li><span className="pulse-avatar gold">MK</span><p><b>Mina</b> added 2 comments<small>1 hour ago</small></p></li></ul></section>
        </div>
      </div>}

      {view === "quests" && <div className="content board-content">
        <div className="page-title"><div><p>PRODUCTION</p><h1>Production board</h1><h2>Move every quest from idea to shipped.</h2></div><div className="board-actions"><select value={project} onChange={e => setProject(e.target.value)} aria-label="Filter by project"><option>All projects</option>{projects.map(p => <option key={p.name}>{p.name}</option>)}</select><button onClick={() => { setProject("All projects"); setQuery(""); }}>Clear filters</button></div></div>
        <div className="board">
          {(["Ready", "In progress", "Review", "Done"] as Status[]).map((status, index) => <section className="board-column" key={status}><header><span className={`status-dot s${index}`}/><h3>{status}</h3><b>{filtered.filter(c => c.status === status).length}</b><button aria-label={`${status} options`}>•••</button></header><div className="column-cards">{filtered.filter(c => c.status === status).map(card => <QuestCard card={card} onOpen={setSelected} compact key={card.id}/>)}<button className="add-inline" onClick={() => setCreateOpen(true)}>＋ Add a card</button></div></section>)}
        </div>
      </div>}

      {view === "timeline" && <div className="content schedule-content">
        <div className="page-title timeline-title"><div><p>PRODUCTION SCHEDULE</p><h1>Timeline</h1><h2>See every team’s card runs, handoffs, and deadlines in one place.</h2></div><div className="timeline-controls"><button>‹</button><button className="today-button">Today</button><button>›</button><select aria-label="Timeline scale"><option>2 weeks</option><option>Month</option><option>Quarter</option></select></div></div>
        <section className="schedule-shell">
          <header className="schedule-month"><div className="lane-corner"><span>TEAMS</span><b>August 2026</b></div><div className="month-band"><span>Week 34</span><i>Festival demo · Aug 30</i></div></header>
          <div className="schedule-scroll">
            <div className="date-grid"><div className="date-label-spacer"/>{timelineDays.map((day, index) => { const [weekday, date] = day.split(" "); return <div className={`date-cell ${index === 1 ? "today" : ""} ${index === 5 || index === 6 || index === 12 || index === 13 ? "weekend" : ""}`} key={day}><small>{weekday}</small><b>{date}</b></div>})}</div>
            <div className="schedule-body">
              <div className="today-line" aria-hidden="true"><span>Today</span></div>
              <div className="deadline-marker deadline-one" title="Playtest checkpoint"><span>◆</span><small>Playtest</small></div>
              <div className="deadline-marker deadline-two" title="Content lock"><span>◆</span><small>Content lock</small></div>
              {timelineLanes.map((lane, laneIndex) => <div className="schedule-row" key={lane.team}><div className="lane-label"><span className={`lane-swatch ${lane.tone}`}/><div><b>{lane.team}</b><small>{lane.owner} · {lane.bars.length} runs</small></div></div><div className="lane-track">{lane.bars.map((bar, barIndex) => <button className={`run-bar ${lane.tone}`} style={{gridColumn:`${bar.start + 1} / span ${bar.span}`}} key={bar.title} onClick={() => setSelected(cards[(laneIndex * 2 + barIndex) % cards.length])} aria-label={`Open ${bar.title}`}><span>{bar.title}</span><small>{bar.span}d</small>{bar.progress > 0 && <i style={{width:`${bar.progress}%`}}/>}</button>)}</div></div>)}
            </div>
          </div>
          <footer className="timeline-legend"><span><i className="legend-dot active-dot"/> Active run</span><span><i className="legend-dot planned-dot"/> Planned</span><span><b>◆</b> Milestone</span><p>Drag the schedule horizontally on smaller screens</p></footer>
        </section>
      </div>}

      {view === "milestones" && <div className="content">
        <div className="page-title"><div><p>ROADMAP</p><h1>Milestones</h1><h2>Keep scope honest and the whole studio moving together.</h2></div><button className="secondary-button">＋ New milestone</button></div>
        <div className="timeline">
          {[{date:"AUG 30",title:"Festival demo",progress:68,color:"violet",cards:"34 / 50 cards",note:"Playable demo for the Autumn Game Showcase"},{date:"SEP 27",title:"Content complete",progress:41,color:"mint",cards:"28 / 68 cards",note:"All chapters and production assets locked"},{date:"NOV 14",title:"Gold candidate",progress:18,color:"coral",cards:"12 / 66 cards",note:"Release-ready build for platform certification"}].map((m, i) => <article className="milestone-row" key={m.title}><div className="date-token"><small>2026</small><b>{m.date}</b></div><span className={`timeline-node ${m.color}`}>{i + 1}</span><div className="milestone-card"><div className="milestone-card-head"><div><small>{i === 0 ? "UP NEXT" : i === 1 ? "PRODUCTION" : "RELEASE"}</small><h3>{m.title}</h3><p>{m.note}</p></div><b>{m.progress}%</b></div><div className="progress-track"><span className={m.color} style={{width:`${m.progress}%`}}/></div><footer><span>{m.cards}</span><span>{i === 0 ? "12 days left" : i === 1 ? "40 days left" : "88 days left"}</span></footer></div></article>)}
        </div>
      </div>}
    </section>

    {createOpen && <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}><section className="modal create-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create a card"><header><div><small>NEW QUEST</small><h2>Forge a card</h2></div><button onClick={() => setCreateOpen(false)} aria-label="Close">×</button></header><form onSubmit={createCard}><label>Card title<input name="title" required autoFocus placeholder="What needs to happen?"/></label><label>Description<textarea name="description" placeholder="Add context, goals, or acceptance notes…"/></label><div className="form-row"><label>Discipline<select name="tag"><option>GAMEPLAY</option><option>ART</option><option>AUDIO</option><option>ENGINEERING</option><option>NARRATIVE</option><option>MARKETING</option></select></label><label>Effort<select name="points"><option value="1">1 point</option><option value="2">2 points</option><option value="3">3 points</option><option value="5">5 points</option><option value="8">8 points</option></select></label></div><label>Project<select name="project">{projects.map(p => <option key={p.name}>{p.name}</option>)}</select></label><footer><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="create-button" type="submit">Create card</button></footer></form></section></div>}

    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal detail-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={selected.title}><div className={`detail-banner ${selected.color}`}><span>{selected.tag}</span><b>{selected.points}</b></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><div className="detail-content"><small>{selected.project.toUpperCase()}</small><h2>{selected.title}</h2><p>{selected.description}</p><div className="detail-grid"><div><small>OWNER</small><b><span className="avatar">{selected.owner}</span> Jamie Kim</b></div><div><small>DUE</small><b>◷ {selected.due}</b></div></div><label>Status<select value={selected.status} onChange={e => updateStatus(selected, e.target.value as Status)}>{productionStages.map(s => <option key={s}>{s}</option>)}</select></label><div className="checklist"><small>CHECKLIST · 2/3</small><p>✓ Verify keyboard controls</p><p>✓ Test with controller</p><p>○ Capture playtest notes</p></div></div></section></div>}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}
