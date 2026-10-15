import { useEffect, useMemo, useRef, useState } from "react";
import { isGoogleSheetsConfigured, loadAppointmentsFromSheet, saveAppointmentsToSheet } from "../googleSheets";

const STORAGE_KEY = "appointment-planner-v2";
const PRIORITIES = [
  { value: 5, label: "Very high", className: "priority-very-high" },
  { value: 4, label: "High", className: "priority-high" },
  { value: 3, label: "Medium", className: "priority-medium" },
  { value: 2, label: "Normal", className: "priority-normal" },
  { value: 1, label: "Low", className: "priority-low" },
  { value: 0, label: "Very low", className: "priority-very-low" },
];

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const currentTimeString = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getInitialAppointments = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Could not read saved appointments:", error);
    return [];
  }
};

const getPriority = (value) => PRIORITIES.find((priority) => priority.value === Number(value)) || PRIORITIES[3];
const getDateTime = (appointment) => new Date(`${appointment.date || todayString()}T${appointment.time || "23:59"}:00`);
const isPast = (appointment) => getDateTime(appointment).getTime() < Date.now();

const formatDate = (dateString, options = { weekday: "short", month: "short", day: "numeric" }) => {
  if (!dateString) return "Date not set";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("en", options).format(date);
};

const formatTime = (timeString) => {
  if (!timeString) return "Time not set";
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
};

const emptyForm = () => ({
  title: "",
  description: "",
  address: "",
  date: todayString(),
  time: currentTimeString(),
  levelOfImportance: 2,
  done: false,
  deleted: false,
});

function Icon({ name, size = 18 }) {
  const paths = {
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" /></>,
    restore: <><path d="M3 11a9 9 0 1 0 2-5" /><path d="M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.spark}
    </svg>
  );
}

function AppointmentModal({ appointment, onClose, onSave }) {
  const [form, setForm] = useState(() => appointment ? { ...appointment } : emptyForm());
  const [error, setError] = useState("");
  const titleRef = useRef(null);
  const editing = Boolean(appointment);

  useEffect(() => {
    titleRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateField = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : name === "levelOfImportance" ? Number(value) : value }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Add a title so you can recognise this appointment later.");
      titleRef.current?.focus();
      return;
    }
    if (!form.date) {
      setError("Choose a date for this appointment.");
      return;
    }
    onSave({ ...form, title: form.title.trim(), description: form.description.trim(), address: form.address.trim() });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
        <div className="modal-heading">
          <div className="modal-heading-icon"><Icon name="calendar" size={21} /></div>
          <div>
            <p className="eyebrow">YOUR SCHEDULE</p>
            <h2 id="appointment-modal-title">{editing ? "Edit appointment" : "Create an appointment"}</h2>
            <p className="modal-subtitle">Keep the important details in one place.</p>
          </div>
          <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close form"><Icon name="close" /></button>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field field-full">
              <span>Appointment title <b>*</b></span>
              <input ref={titleRef} name="title" value={form.title} onChange={updateField} maxLength={150} placeholder="e.g. Project review with the team" required />
              <small>{form.title.length}/150 characters</small>
            </label>

            <label className="field field-full">
              <span>Description</span>
              <textarea name="description" value={form.description || ""} onChange={updateField} maxLength={600} rows={3} placeholder="Add an agenda, notes, or anything you need to remember…" />
              <small>{(form.description || "").length}/600 characters</small>
            </label>

            <label className="field">
              <span>Date <b>*</b></span>
              <input type="date" name="date" value={form.date || todayString()} onChange={updateField} required />
            </label>
            <label className="field">
              <span>Time</span>
              <input type="time" name="time" value={form.time || ""} onChange={updateField} />
            </label>
            <label className="field field-full">
              <span>Location or meeting link</span>
              <input name="address" value={form.address || ""} onChange={updateField} maxLength={200} placeholder="Office, venue, or video-call link" />
            </label>
            <label className="field field-full">
              <span>Priority</span>
              <select name="levelOfImportance" value={Number(form.levelOfImportance ?? 2)} onChange={updateField}>
                {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
              </select>
            </label>
            {editing && (
              <div className="field field-full status-field">
                <label className="check-field"><input type="checkbox" name="done" checked={Boolean(form.done)} onChange={updateField} /><span>Mark as completed</span></label>
                <label className="check-field"><input type="checkbox" name="deleted" checked={Boolean(form.deleted)} onChange={updateField} /><span>Move to archive</span></label>
              </div>
            )}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit"><Icon name="check" size={17} /> {editing ? "Save changes" : "Add appointment"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AppointmentCard({ appointment, onEdit, onToggleDone, onArchive, onRestore }) {
  const priority = getPriority(appointment.levelOfImportance);
  const overdue = !appointment.done && !appointment.deleted && isPast(appointment);
  const date = new Date(`${appointment.date || todayString()}T12:00:00`);
  return (
    <article className={`appointment-card ${appointment.done ? "is-complete" : ""} ${appointment.deleted ? "is-archived" : ""}`}>
      <div className="date-tile" aria-label={formatDate(appointment.date, { month: "long", day: "numeric", year: "numeric" })}>
        <span>{new Intl.DateTimeFormat("en", { month: "short" }).format(date)}</span>
        <strong>{date.getDate()}</strong>
        <small>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</small>
      </div>
      <div className="appointment-main">
        <div className="appointment-card-topline">
          <div className="appointment-tags">
            <span className={`priority-pill ${priority.className}`}><span className="priority-dot" />{priority.label}</span>
            {appointment.done && <span className="status-pill completed-pill"><Icon name="check" size={12} /> Completed</span>}
            {appointment.deleted && <span className="status-pill archived-pill">Archived</span>}
            {overdue && <span className="status-pill overdue-pill">Overdue</span>}
          </div>
          <span className="appointment-time"><Icon name="clock" size={15} /> {formatTime(appointment.time)}</span>
        </div>
        <h3>{appointment.title}</h3>
        {appointment.description && <p className="appointment-description">{appointment.description}</p>}
        {appointment.address && <p className="appointment-location"><Icon name="pin" size={15} /><span>{appointment.address}</span></p>}
        <div className="appointment-actions">
          {!appointment.deleted && (
            <button className={`text-action ${appointment.done ? "undo-action" : "complete-action"}`} type="button" onClick={() => onToggleDone(appointment)}>
              <Icon name={appointment.done ? "restore" : "check"} size={15} /> {appointment.done ? "Mark as active" : "Mark complete"}
            </button>
          )}
          <button className="text-action" type="button" onClick={() => onEdit(appointment)}><Icon name="edit" size={15} /> Edit</button>
          {appointment.deleted ? (
            <button className="text-action restore-action" type="button" onClick={() => onRestore(appointment)}><Icon name="restore" size={15} /> Restore</button>
          ) : (
            <button className="text-action archive-action" type="button" onClick={() => onArchive(appointment)}><Icon name="archive" size={15} /> Archive</button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [appointments, setAppointments] = useState(getInitialAppointments);
  const [activeView, setActiveView] = useState("all");
  const [search, setSearch] = useState("");
  const [dateScope, setDateScope] = useState("any");
  const [priorityScope, setPriorityScope] = useState("any");
  const [sortOrder, setSortOrder] = useState("soonest");
  const [modalAppointment, setModalAppointment] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [cloudStatus, setCloudStatus] = useState(isGoogleSheetsConfigured() ? "connecting" : "local");
  const [cloudReady, setCloudReady] = useState(false);
  const importRef = useRef(null);
  const today = todayString();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
    } catch (error) {
      console.error("Could not save appointments:", error);
      setNotice("Browser storage is full or unavailable. Export a backup and free up space.");
    }
  }, [appointments]);

  // Load the shared Google Sheet once on startup. If the sheet is empty but this
  // browser already has appointments, migrate that local list to the sheet.
  useEffect(() => {
    if (!isGoogleSheetsConfigured()) return undefined;
    let active = true;

    const connectToGoogleSheets = async () => {
      try {
        const remoteAppointments = await loadAppointmentsFromSheet();
        if (!active) return;

        const localAppointments = getInitialAppointments();
        if (remoteAppointments.length === 0 && localAppointments.length > 0) {
          await saveAppointmentsToSheet(localAppointments);
          if (!active) return;
          setAppointments(localAppointments);
          setCloudStatus("connected");
          setCloudReady(true);
          setNotice(`Copied ${localAppointments.length} existing appointment(s) to Google Sheets.`);
          return;
        }

        setAppointments(remoteAppointments);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteAppointments));
        } catch (storageError) {
          console.warn("Could not refresh the local appointment cache:", storageError);
        }
        setCloudStatus("connected");
        setCloudReady(true);
        setNotice(remoteAppointments.length
          ? `Loaded ${remoteAppointments.length} appointment(s) from Google Sheets.`
          : "Google Sheets connected. New appointments will be saved there.");
      } catch (error) {
        console.error("Google Sheets connection failed:", error);
        if (!active) return;
        setCloudStatus("error");
        setNotice("Google Sheets could not be reached. Your browser copy is still available.");
      }
    };

    connectToGoogleSheets();
    return () => { active = false; };
  }, []);

  // Save the full list to the sheet after each change. Writes are serialized and
  // verified by reading the sheet back before showing the connected status.
  useEffect(() => {
    if (!cloudReady || !isGoogleSheetsConfigured()) return undefined;
    let active = true;
    setCloudStatus("saving");
    saveAppointmentsToSheet(appointments)
      .then(() => {
        if (active) setCloudStatus("connected");
      })
      .catch((error) => {
        console.error("Google Sheets sync failed:", error);
        if (active) {
          setCloudStatus("error");
          setNotice("Google Sheets sync failed. Your browser copy is still saved; check the backend setup.");
        }
      });
    return () => { active = false; };
  }, [appointments, cloudReady]);


  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const stats = useMemo(() => {
    const activeAppointments = appointments.filter((item) => !item.deleted);
    const upcoming = activeAppointments.filter((item) => !item.done && getDateTime(item).getTime() >= Date.now());
    return {
      total: activeAppointments.length,
      upcoming: upcoming.length,
      completed: activeAppointments.filter((item) => item.done).length,
      important: activeAppointments.filter((item) => !item.done && Number(item.levelOfImportance) >= 4).length,
    };
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    let results = appointments.filter((item) => {
      if (activeView === "all" && item.deleted) return false;
      if (activeView === "upcoming" && (item.deleted || item.done || isPast(item))) return false;
      if (activeView === "completed" && (item.deleted || !item.done)) return false;
      if (activeView === "archived" && !item.deleted) return false;
      if (query && ![item.title, item.description, item.address].some((value) => (value || "").toLowerCase().includes(query))) return false;
      if (priorityScope !== "any" && Number(item.levelOfImportance) !== Number(priorityScope)) return false;
      if (dateScope === "today" && item.date !== today) return false;
      if (dateScope === "week" && (getDateTime(item) < new Date(`${today}T00:00:00`) || getDateTime(item) > nextWeek)) return false;
      if (dateScope === "overdue" && (!isPast(item) || item.done || item.deleted)) return false;
      return true;
    });

    results = [...results].sort((a, b) => {
      if (sortOrder === "priority") return Number(b.levelOfImportance) - Number(a.levelOfImportance) || getDateTime(a) - getDateTime(b);
      if (sortOrder === "latest") return getDateTime(b) - getDateTime(a);
      return getDateTime(a) - getDateTime(b);
    });
    return results;
  }, [appointments, activeView, search, dateScope, priorityScope, sortOrder, today]);

  const saveAppointment = (form) => {
    if (modalAppointment) {
      setAppointments((current) => current.map((item) => item.id === modalAppointment.id ? { ...item, ...form, updatedAt: new Date().toISOString() } : item));
      setNotice("Appointment updated.");
    } else {
      setAppointments((current) => [{ ...form, id: makeId(), createdAt: new Date().toISOString() }, ...current]);
      setNotice("Appointment added to your schedule.");
    }
    setModalAppointment(null);
    setIsCreating(false);
  };

  const toggleDone = (appointment) => {
    setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, done: !item.done, updatedAt: new Date().toISOString() } : item));
    setNotice(appointment.done ? "Appointment marked as active." : "Nice — appointment completed.");
  };

  const toggleArchive = (appointment, archived) => {
    setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, deleted: archived, updatedAt: new Date().toISOString() } : item));
    setNotice(archived ? "Appointment moved to archive." : "Appointment restored.");
  };

  const exportJson = () => {
    downloadFile(`appointments-backup-${today}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), appointments }, null, 2), "application/json");
    setNotice("Backup downloaded as JSON.");
  };

  const exportCsv = () => {
    const headers = ["Title", "Description", "Date", "Time", "Location", "Priority", "Completed", "Archived"];
    const rows = appointments.map((item) => [item.title, item.description, item.date, item.time, item.address, getPriority(item.levelOfImportance).label, item.done ? "Yes" : "No", item.deleted ? "Yes" : "No"]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile(`appointments-${today}.csv`, csv, "text/csv;charset=utf-8");
    setNotice("Appointments exported as CSV.");
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.appointments;
      if (!Array.isArray(incoming)) throw new Error("This file does not contain an appointments list.");
      const cleaned = incoming.filter((item) => item && typeof item.title === "string" && item.title.trim()).map((item) => ({
        id: item.id || makeId(),
        title: item.title.trim(),
        description: item.description || "",
        address: item.address || "",
        date: String(item.date || today).split("T")[0],
        time: item.time || "09:00",
        levelOfImportance: Number.isFinite(Number(item.levelOfImportance)) ? Math.min(5, Math.max(0, Number(item.levelOfImportance))) : 2,
        done: Boolean(item.done),
        deleted: Boolean(item.deleted),
        createdAt: item.createdAt || new Date().toISOString(),
      }));
      if (!cleaned.length && incoming.length) throw new Error("No valid appointments were found in this file.");
      if (!window.confirm(`Import ${cleaned.length} appointment(s)? This will replace the current list on this browser.`)) return;
      setAppointments(cleaned);
      setActiveView("all");
      setSearch("");
      setNotice(`${cleaned.length} appointment(s) imported.`);
    } catch (error) {
      setNotice(error.message || "Could not read that backup file.");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDateScope("any");
    setPriorityScope("any");
    setSortOrder("soonest");
  };

  const openEdit = (appointment) => {
    setIsCreating(false);
    setModalAppointment(appointment);
  };

  const closeModal = () => {
    setModalAppointment(null);
    setIsCreating(false);
  };

  const views = [
    { id: "all", label: "All appointments", count: stats.total },
    { id: "upcoming", label: "Upcoming", count: stats.upcoming },
    { id: "completed", label: "Completed", count: stats.completed },
    { id: "archived", label: "Archive", count: appointments.filter((item) => item.deleted).length },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Planora home">
          <span className="brand-mark"><Icon name="calendar" size={22} /></span>
          <span className="brand-copy"><strong>Planora</strong><small>YOUR PERSONAL PLANNER</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`local-badge cloud-badge cloud-${cloudStatus}`} title={
            cloudStatus === "connected" ? "Appointment changes are synchronised with Google Sheets." :
            cloudStatus === "saving" ? "Saving your appointment changes to Google Sheets." :
            cloudStatus === "connecting" ? "Connecting to the Google Sheets backend." :
            cloudStatus === "error" ? "Google Sheets is not syncing. The browser copy remains available." :
            "Google Sheets is not configured. Appointments are stored only in this browser."
          }><span className="cloud-status-dot" />{
            cloudStatus === "connected" ? "Synced to Google Sheets" :
            cloudStatus === "saving" ? "Saving to Google Sheets…" :
            cloudStatus === "connecting" ? "Connecting to Sheets…" :
            cloudStatus === "error" ? "Google Sheets sync issue" :
            "Browser-only storage"
          }</span>
          <button className="button button-primary top-add" onClick={() => { setModalAppointment(null); setIsCreating(true); }}><Icon name="plus" size={18} /> New appointment</button>
        </div>
      </header>

      <main className="page-content" id="top">
        <section className="welcome-section">
          <div>
            <p className="eyebrow"><Icon name="spark" size={14} /> MAKE ROOM FOR WHAT MATTERS</p>
            <h1>Your time, <span>under control.</span></h1>
            <p className="welcome-copy">One clear view of your appointments, plans, and priorities.</p>
          </div>
          <div className="today-panel">
            <div className="today-icon"><Icon name="calendar" size={21} /></div>
            <div><span>TODAY</span><strong>{formatDate(today, { weekday: "long", month: "long", day: "numeric" })}</strong></div>
          </div>
        </section>

        <section className="stats-grid" aria-label="Appointment summary">
          <div className="stat-card stat-blue"><div className="stat-top"><span className="stat-icon"><Icon name="calendar" /></span><span className="stat-label">On your list</span></div><strong className="stat-number">{stats.total}</strong><span className="stat-caption">Active appointments</span></div>
          <div className="stat-card stat-purple"><div className="stat-top"><span className="stat-icon"><Icon name="clock" /></span><span className="stat-label">Coming up</span></div><strong className="stat-number">{stats.upcoming}</strong><span className="stat-caption">Still ahead of you</span></div>
          <div className="stat-card stat-green"><div className="stat-top"><span className="stat-icon"><Icon name="check" /></span><span className="stat-label">Well done</span></div><strong className="stat-number">{stats.completed}</strong><span className="stat-caption">Completed appointments</span></div>
          <div className="stat-card stat-orange"><div className="stat-top"><span className="stat-icon"><Icon name="spark" /></span><span className="stat-label">High priority</span></div><strong className="stat-number">{stats.important}</strong><span className="stat-caption">Need extra attention</span></div>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div><p className="eyebrow">STAY ON TRACK</p><h2>Your appointments</h2><p className="section-subtitle">Your next steps, organised in one place.</p></div>
            <div className="backup-actions">
              <button className="button button-light" onClick={exportCsv} title="Download a spreadsheet-friendly CSV"><Icon name="download" size={16} /> Export CSV</button>
              <button className="button button-light" onClick={exportJson} title="Download a restorable JSON backup"><Icon name="download" size={16} /> Backup</button>
              <button className="button button-light" onClick={() => importRef.current?.click()} title="Restore appointments from a JSON backup"><Icon name="upload" size={16} /> Import</button>
              <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJson} aria-label="Import appointment backup" />
            </div>
          </div>

          <div className="view-tabs" role="tablist" aria-label="Appointment views">
            {views.map((view) => <button key={view.id} className={`view-tab ${activeView === view.id ? "active" : ""}`} role="tab" aria-selected={activeView === view.id} onClick={() => setActiveView(view.id)}>{view.label}<span>{view.count}</span></button>)}
          </div>

          <div className="filter-panel">
            <label className="search-box"><Icon name="search" size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search appointments, notes, locations…" aria-label="Search appointments" />{search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear search"><Icon name="close" size={15} /></button>}</label>
            <label className="filter-control"><span>DATE</span><select value={dateScope} onChange={(event) => setDateScope(event.target.value)} aria-label="Filter by date"><option value="any">Any date</option><option value="today">Today</option><option value="week">Next 7 days</option><option value="overdue">Overdue</option></select></label>
            <label className="filter-control"><span>PRIORITY</span><select value={priorityScope} onChange={(event) => setPriorityScope(event.target.value)} aria-label="Filter by priority"><option value="any">Any priority</option>{PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
            <label className="filter-control sort-control"><span>SORT BY</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort appointments"><option value="soonest">Soonest first</option><option value="latest">Latest first</option><option value="priority">Priority first</option></select></label>
            <button className="reset-filters" onClick={clearFilters}>Reset</button>
          </div>

          <div className="results-line"><span>{filteredAppointments.length} {filteredAppointments.length === 1 ? "appointment" : "appointments"}</span><span>{activeView === "archived" ? "Archived items" : activeView === "completed" ? "Your completed work" : "Your schedule"}</span></div>

          {filteredAppointments.length > 0 ? (
            <div className="appointments-list">
              {filteredAppointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onEdit={openEdit} onToggleDone={toggleDone} onArchive={(item) => toggleArchive(item, true)} onRestore={(item) => toggleArchive(item, false)} />)}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-illustration"><span className="empty-illustration-back" /><span className="empty-illustration-front"><Icon name="calendar" size={32} /></span><span className="empty-spark">✦</span></div>
              <h3>{search || dateScope !== "any" || priorityScope !== "any" ? "No matches found" : activeView === "completed" ? "Nothing completed yet" : activeView === "archived" ? "Your archive is clear" : activeView === "upcoming" ? "Nothing coming up" : "Start with one good plan"}</h3>
              <p>{search || dateScope !== "any" || priorityScope !== "any" ? "Try changing your search or clearing a filter." : activeView === "completed" ? "Completed appointments will show up here." : activeView === "archived" ? "Archived appointments will be kept here, out of your active list." : activeView === "upcoming" ? "Add a future appointment and it will appear here." : "Create an appointment and give your day a little more structure."}</p>
              {search || dateScope !== "any" || priorityScope !== "any" ? <button className="button button-secondary" onClick={clearFilters}>Clear filters</button> : activeView === "all" ? <button className="button button-primary" onClick={() => { setModalAppointment(null); setIsCreating(true); }}><Icon name="plus" size={17} /> Add your first appointment</button> : null}
            </div>
          )}
        </section>

        <footer className="page-footer"><span>Planora <span className="footer-dot">·</span> A calmer way to plan.</span><span><Icon name={cloudStatus === "error" ? "close" : "check"} size={13} />{
          cloudStatus === "connected" ? " Your appointments are synced with Google Sheets." :
          cloudStatus === "saving" ? " Syncing your latest changes to Google Sheets…" :
          cloudStatus === "connecting" ? " Connecting to Google Sheets…" :
          cloudStatus === "error" ? " Google Sheets sync failed; your browser copy remains saved." :
          " Saved in this browser only. Connect Google Sheets for cross-device sync."
        }</span></footer>
      </main>

      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><Icon name="close" size={15} /></button></div>}
      {(isCreating || modalAppointment) && <AppointmentModal appointment={modalAppointment} onClose={closeModal} onSave={saveAppointment} />}
    </div>
  );
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
