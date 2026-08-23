/* ===========================================================
   app.js — application state, view rendering, event wiring
   =========================================================== */

const State = {
  apps: [],
  settings: DEFAULT_SETTINGS,
  view: "dashboard",
  selection: new Set(),
  filters: { search: "", statuses: [], tag: "", favoriteOnly: false, sort: "dateApplied-desc" },
  timeRange: "week",
  draft: null,        // in-memory application being created/edited in the modal
  editingId: null,    // null = creating new
  activeTab: "overview",
  confirmCallback: null,
};

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const { apps, settings } = Store.loadAll();
  State.apps = apps;
  State.settings = settings;
  applyTheme(settings.theme);

  wireNav();
  wireDashboard();
  wireApplicationsToolbar();
  wireModal();
  wireCalendar();
  wireKanban();
  wireSettings();
  wireGlobalModals();
  wireExtensionImport();

  renderAll();
});

function renderAll() {
  renderDashboard();
  renderApplications();
  renderSettingsPanel();
}

// ------------------------------------------------------------------
// Hermes Job Clipper (browser extension) bridge
// ------------------------------------------------------------------
// Entirely optional and entirely offline: if the Hermes Job Clipper
// extension is installed and pointed at this page, it dispatches this
// event with any jobs queued since Hermes was last open. Nothing about
// the core app depends on the extension being present.
function wireExtensionImport() {
  window.addEventListener("hermes-import-jobs", e => {
    const jobs = Array.isArray(e.detail) ? e.detail : [];
    if (!jobs.length) return;
    jobs.forEach(importClippedJob);
    State.apps = Store.getApps();
    renderAll();
    toast(`Imported ${jobs.length} job${jobs.length === 1 ? "" : "s"} from Hermes Clipper`);
  });
}

function importClippedJob(job) {
  const app = emptyApplication({
    company: (job.company || "").trim(),
    position: (job.title || "").trim(),
    location: (job.location || "").trim(),
    jobUrl: (job.url || "").trim(),
    jobDescription: (job.description || "").trim(),
    status: "wishlist",
    tags: Array.from(new Set(["clipped", ...(Array.isArray(job.tags) ? job.tags : [])])),
  });
  if (job.salaryMin || job.salaryMax) {
    app.salary = {
      min: job.salaryMin || "",
      max: job.salaryMax || "",
      currency: job.salaryCurrency || "USD",
      period: job.salaryPeriod === "hour" ? "hour" : "year",
    };
  }
  // The extension only fills these in from actual structured data on the
  // page (a company's own listed address/size in JobPosting JSON-LD) — never
  // guessed — so it's safe to drop straight into Company Intelligence.
  if (job.companyHq || job.companySize) {
    app.companyIntel.hq = job.companyHq || "";
    app.companyIntel.size = job.companySize || "";
  }
  Store.upsertApp(app);
  return app;
}

// ------------------------------------------------------------------
// Navigation
// ------------------------------------------------------------------
function wireNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("new-app-btn").addEventListener("click", () => openAppModal(null));
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = State.settings.theme === "dark" ? "light" : "dark";
    State.settings.theme = next;
    Store.updateSettings({ theme: next });
    applyTheme(next);
    renderSettingsPanel();
  });
}

function switchView(view) {
  State.view = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "dashboard") renderDashboard();
  if (view === "applications") renderApplications();
  if (view === "calendar") renderCalendarView();
  if (view === "kanban") renderKanbanView();
  if (view === "settings") renderSettingsPanel();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const moon = document.getElementById("theme-icon-moon");
  const sun = document.getElementById("theme-icon-sun");
  if (moon && sun) {
    moon.hidden = theme !== "dark";
    sun.hidden = theme === "dark";
  }
}

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------
function wireDashboard() {
  document.querySelectorAll("#time-range-toggle .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      State.timeRange = btn.dataset.range;
      document.querySelectorAll("#time-range-toggle .seg-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderTimeChart();
    });
  });
}

function renderDashboard() {
  const stats = Analytics.computeStats(State.apps);
  const grid = document.getElementById("stat-grid");
  const tiles = [
    { label: "Applications", value: stats.total },
    { label: "Interviews", value: stats.interviews },
    { label: "Offers", value: stats.offers },
    { label: "Response rate", value: stats.responseRate + "%" },
    { label: "Avg. days to response", value: stats.avgDaysToResponse ?? "—" },
    { label: "Avg. days to rejection", value: stats.avgDaysToRejection ?? "—" },
    { label: "Avg. salary", value: Analytics.formatSalary(stats.avgSalary) },
    { label: "Open tasks", value: stats.openTasks },
  ];
  grid.innerHTML = tiles.map(t => `
    <div class="stat-tile">
      <div class="stat-value">${t.value}</div>
      <div class="stat-label">${t.label}</div>
    </div>`).join("");

  renderTimeChart();
  Charts.renderPieChart(document.getElementById("status-chart"), Analytics.statusDistribution(State.apps));

  renderUpcomingList(document.getElementById("dashboard-upcoming"), CalendarView.upcomingReminders(State.apps));
  renderInsights();
}

function renderInsights() {
  const container = document.getElementById("insights-list");
  if (!container) return;
  const insights = Analytics.generateInsights(State.apps);
  container.innerHTML = insights.map(i => `
    <div class="insight-item insight-${i.kind}" ${i.appId ? `data-app-id="${i.appId}"` : ""}>
      <span class="insight-icon">${insightIcon(i.kind)}</span>
      <span>${escapeHtml(i.text)}</span>
    </div>`).join("");
  container.querySelectorAll(".insight-item[data-app-id]").forEach(el => {
    el.addEventListener("click", () => openAppModal(el.dataset.appId));
  });
}

function insightIcon(kind) {
  const icons = {
    followup: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 3h6"/></svg>`,
    pattern: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,
  };
  return icons[kind] || icons.info;
}

function renderTimeChart() {
  const data = State.timeRange === "week" ? Analytics.weeklySeries(State.apps) : Analytics.monthlySeries(State.apps);
  Charts.renderBarChart(document.getElementById("time-chart"), data);
}

function renderUpcomingList(container, items) {
  if (!items.length) {
    container.innerHTML = `<div class="chart-empty">Nothing outstanding — you're all caught up.</div>`;
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="upcoming-item" data-app-id="${item.appId}">
      <span class="upcoming-date">${formatDate(item.date)}</span>
      <span class="upcoming-badge ${item.kind}">${item.kind === "task" ? "Task" : "Event"}</span>
      <span class="upcoming-label">${escapeHtml(item.label)}</span>
      <span class="upcoming-company muted">${escapeHtml(item.company)}</span>
    </div>`).join("");
  container.querySelectorAll(".upcoming-item").forEach(el => {
    el.addEventListener("click", () => openAppModal(el.dataset.appId));
  });
}

// ------------------------------------------------------------------
// Applications list — filters, sort, search, render
// ------------------------------------------------------------------
function wireApplicationsToolbar() {
  const statusList = document.getElementById("status-filter-list");
  statusList.innerHTML = STATUS_PIPELINE.map(s => `
    <label class="status-filter-item">
      <input type="checkbox" class="status-filter-cb" value="${s.key}">
      <span class="status-filter-dot" style="background:${s.color}"></span>
      ${s.label}
    </label>`).join("");

  const btn = document.getElementById("status-filter-btn");
  const menu = document.getElementById("status-filter-menu");
  const allCb = document.getElementById("status-filter-all-cb");
  const itemCbs = () => Array.from(document.querySelectorAll(".status-filter-cb"));

  btn.addEventListener("click", e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", e => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });

  allCb.addEventListener("change", () => {
    if (allCb.checked) {
      itemCbs().forEach(cb => cb.checked = false);
      State.filters.statuses = [];
      updateStatusFilterLabel();
      renderApplications();
    } else if (!itemCbs().some(cb => cb.checked)) {
      allCb.checked = true; // don't allow leaving nothing selected
    }
  });

  itemCbs().forEach(cb => {
    cb.addEventListener("change", () => {
      const selected = itemCbs().filter(c => c.checked).map(c => c.value);
      allCb.checked = selected.length === 0;
      State.filters.statuses = selected;
      updateStatusFilterLabel();
      renderApplications();
    });
  });

  document.getElementById("search-input").addEventListener("input", e => {
    State.filters.search = e.target.value.toLowerCase();
    renderApplications();
  });
  document.getElementById("filter-tag").addEventListener("change", e => {
    State.filters.tag = e.target.value;
    renderApplications();
  });
  document.getElementById("filter-favorite").addEventListener("change", e => {
    State.filters.favoriteOnly = e.target.checked;
    renderApplications();
  });
  document.getElementById("sort-select").addEventListener("change", e => {
    State.filters.sort = e.target.value;
    renderApplications();
  });
  document.getElementById("select-all").addEventListener("change", e => {
    const cards = getFilteredSortedApps();
    if (e.target.checked) cards.forEach(a => State.selection.add(a.id));
    else State.selection.clear();
    renderApplications();
  });
  document.getElementById("empty-new-btn").addEventListener("click", () => openAppModal(null));

  // bulk bar
  const bulkStatusSelect = document.getElementById("bulk-status-select");
  bulkStatusSelect.innerHTML += STATUS_PIPELINE.map(s => `<option value="${s.key}">${s.label}</option>`).join("");
  bulkStatusSelect.addEventListener("change", () => {
    const key = bulkStatusSelect.value;
    if (!key) return;
    State.selection.forEach(id => {
      const app = Store.getApp(id);
      if (app) { setStatus(app, key); Store.upsertApp(app); }
    });
    bulkStatusSelect.value = "";
    toast(`Updated ${State.selection.size} application(s)`);
    State.apps = Store.getApps();
    renderAll();
  });
  document.getElementById("bulk-delete-btn").addEventListener("click", () => {
    confirmDialog(`Delete ${State.selection.size} selected application(s)? This can't be undone.`, () => {
      Store.deleteApps(Array.from(State.selection));
      State.apps = Store.getApps();
      State.selection.clear();
      renderAll();
      toast("Deleted selected applications");
    });
  });
  document.getElementById("bulk-clear-btn").addEventListener("click", () => {
    State.selection.clear();
    renderApplications();
  });
}

function updateStatusFilterLabel() {
  const label = document.getElementById("status-filter-label");
  const n = State.filters.statuses.length;
  if (n === 0) label.textContent = "All statuses";
  else if (n === 1) label.textContent = STATUS_MAP[State.filters.statuses[0]].label;
  else label.textContent = `${n} statuses`;
}

function getFilteredSortedApps() {
  const f = State.filters;
  let list = State.apps.filter(a => {
    if (f.search) {
      const hay = `${a.company} ${a.position} ${a.location} ${a.notes}`.toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    if (f.statuses.length && !f.statuses.includes(a.status)) return false;
    if (f.tag && !(a.tags || []).includes(f.tag)) return false;
    if (f.favoriteOnly && !a.favorite) return false;
    return true;
  });

  const [field, dir] = f.sort.includes("-") ? f.sort.split("-") : [f.sort, "asc"];
  list = list.slice().sort((a, b) => {
    let cmp = 0;
    if (field === "dateApplied") cmp = (a.dateApplied || "").localeCompare(b.dateApplied || "");
    else if (field === "status") cmp = STATUS_MAP[a.status].order - STATUS_MAP[b.status].order;
    else if (field === "company") cmp = a.company.localeCompare(b.company);
    else if (field === "rating") cmp = (a.rating || 0) - (b.rating || 0);
    else if (field === "updated") cmp = (a.updatedAt || "").localeCompare(b.updatedAt || "");
    return dir === "desc" ? -cmp : cmp;
  });
  return list;
}

function renderApplications() {
  // refresh tag filter options
  const tagSelect = document.getElementById("filter-tag");
  const currentTag = State.filters.tag;
  const allTags = getAllTags();
  tagSelect.innerHTML = `<option value="">All tags</option>` + allTags.map(t => `<option value="${t}">${t}</option>`).join("");
  tagSelect.value = currentTag;

  const list = getFilteredSortedApps();
  const container = document.getElementById("application-list");
  const emptyState = document.getElementById("empty-state");
  document.getElementById("results-count").textContent = `${list.length} application${list.length === 1 ? "" : "s"}`;

  if (!list.length) {
    container.innerHTML = "";
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    container.innerHTML = list.map(renderAppCard).join("");
  }

  container.querySelectorAll(".app-card").forEach(card => {
    const id = card.dataset.id;
    card.querySelector(".card-checkbox").addEventListener("change", e => {
      if (e.target.checked) State.selection.add(id); else State.selection.delete(id);
      updateBulkBar();
    });
    card.querySelector(".fav-star").addEventListener("click", e => {
      e.stopPropagation();
      const app = Store.getApp(id);
      app.favorite = !app.favorite;
      Store.upsertApp(app);
      State.apps = Store.getApps();
      renderApplications();
    });
    const statusSel = card.querySelector(".card-status-select");
    statusSel.addEventListener("click", e => e.stopPropagation());
    statusSel.addEventListener("change", e => {
      const app = Store.getApp(id);
      setStatus(app, e.target.value);
      Store.upsertApp(app);
      State.apps = Store.getApps();
      renderAll();
    });
    card.querySelector(".card-delete-btn").addEventListener("click", e => {
      e.stopPropagation();
      confirmDialog(`Delete application for ${escapeHtml(Store.getApp(id).position)} at ${escapeHtml(Store.getApp(id).company)}?`, () => {
        Store.deleteApp(id);
        State.apps = Store.getApps();
        State.selection.delete(id);
        renderAll();
        toast("Application deleted");
      });
    });
    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-checkbox, .fav-star, .card-status-select, .card-delete-btn")) return;
      openAppModal(id);
    });
  });

  updateBulkBar();
  document.getElementById("select-all").checked = list.length > 0 && list.every(a => State.selection.has(a.id));
}

function getAllTags() {
  const fromApps = new Set();
  State.apps.forEach(a => (a.tags || []).forEach(t => fromApps.add(t)));
  const combined = new Set([...DEFAULT_TAGS, ...(State.settings.customTags || []), ...fromApps]);
  return Array.from(combined).sort();
}

function updateBulkBar() {
  const bar = document.getElementById("bulk-bar");
  bar.hidden = State.selection.size === 0;
  document.getElementById("bulk-count").textContent = `${State.selection.size} selected`;
}

function renderAppCard(app) {
  const status = STATUS_MAP[app.status];
  const checklistDone = CHECKLIST_ITEMS.filter(c => app.checklist?.[c.key]).length;
  const stars = "★".repeat(app.rating || 0) + "☆".repeat(5 - (app.rating || 0));
  const tags = (app.tags || []).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
  const statusOptions = STATUS_PIPELINE.map(s => `<option value="${s.key}" ${s.key === app.status ? "selected" : ""}>${s.label}</option>`).join("");
  const openTasks = (app.tasks || []).filter(t => !t.done).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const todayStr = todayISO();

  const taskPreview = openTasks.length ? `
    <div class="card-tasks">
      ${openTasks.slice(0, 2).map(t => `
        <span class="card-task-chip ${t.dueDate && t.dueDate < todayStr ? "overdue" : ""}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
          ${escapeHtml(t.title)}${t.dueDate ? ` · ${formatDate(t.dueDate)}` : ""}
        </span>`).join("")}
      ${openTasks.length > 2 ? `<span class="card-task-chip more">+${openTasks.length - 2} more</span>` : ""}
    </div>` : "";

  return `
    <article class="app-card" data-id="${app.id}" style="--status-color:${status.color}">
      <div class="card-top">
        <input type="checkbox" class="card-checkbox" ${State.selection.has(app.id) ? "checked" : ""} aria-label="Select">
        <button class="fav-star ${app.favorite ? "active" : ""}" title="Toggle favorite" aria-label="Favorite">${app.favorite ? "★" : "☆"}</button>
        <div class="card-title">
          <h3>${escapeHtml(app.company) || "Untitled company"}</h3>
          <p class="muted">${escapeHtml(app.position) || "—"} ${app.location ? "· " + escapeHtml(app.location) : ""}</p>
        </div>
        <select class="card-status-select" style="--status-color:${status.color}">${statusOptions}</select>
      </div>

      <div class="card-track">${renderMiniTrack(app.status)}</div>

      <div class="card-meta">
        <span class="muted">Applied ${app.dateApplied ? formatDate(app.dateApplied) : "—"}</span>
        <span class="stars" title="Fit rating">${stars}</span>
        <span class="muted checklist-progress" title="Checklist">✓ ${checklistDone}/${CHECKLIST_ITEMS.length}</span>
      </div>

      ${taskPreview}
      ${tags ? `<div class="card-tags">${tags}</div>` : ""}

      <div class="card-actions">
        <button class="btn-ghost card-delete-btn">Delete</button>
      </div>
    </article>`;
}

function renderMiniTrack(currentKey) {
  const current = STATUS_MAP[currentKey];
  const isClosed = CLOSED_STATUSES.includes(currentKey);
  const openNodes = STATUS_PIPELINE.filter(s => !CLOSED_STATUSES.includes(s.key)).map(s => {
    const stageOrder = STATUS_MAP[s.key].order;
    const reached = !isClosed && stageOrder <= current.order;
    return `<span class="track-node ${reached ? "reached" : ""}" style="--dot-color:${s.color}" title="${s.label}"></span>`;
  }).join("");
  const closedNode = isClosed
    ? `<span class="track-node reached closed-node" style="--dot-color:${current.color}" title="${current.label}"></span>`
    : "";
  return openNodes + closedNode;
}

// Two distinct, deliberately different actions — this used to be one
// function, which is exactly what caused status and timeline history to
// fight each other:
//
// setStatus() — an explicit, deliberate status change (Overview dropdown,
// card quick-select, bulk edit, Kanban drag). Always takes effect
// immediately and clears out any timeline entries for pipeline stages
// beyond the new status, since a deliberate change means those no longer
// reflect reality (this is what keeps analytics correct when someone
// corrects a status backward).
//
// logHistoricalEvent() — a dated entry from the Timeline tab's "Log an
// event" form. Always recorded as history for its own date, but only moves
// the application's current status forward — backfilling an earlier stage
// (e.g. adding "Applied" after the application is already at "Technical
// Interview") never regresses a status that's already further along.
function setStatus(app, statusKey) {
  const date = (statusKey === "applied" && app.dateApplied) ? app.dateApplied : todayISO();
  const newOrder = STATUS_MAP[statusKey].order;
  app.timeline = (app.timeline || []).filter(t => !t.statusKey || STATUS_MAP[t.statusKey].order <= newOrder);
  logTimelineEntry(app, statusKey, date, "");
  app.status = statusKey;
  if (statusKey === "applied" && !app.dateApplied) app.dateApplied = date;
}

function logHistoricalEvent(app, statusKey, date, notes) {
  logTimelineEntry(app, statusKey, date, notes);
  const newOrder = STATUS_MAP[statusKey].order;
  const currentOrder = STATUS_MAP[app.status].order;
  if (newOrder >= currentOrder) {
    app.status = statusKey;
    if (statusKey === "applied" && !app.dateApplied) app.dateApplied = date;
  }
}

function logTimelineEntry(app, statusKey, date, notes) {
  app.timeline = app.timeline || [];
  const existing = app.timeline.find(t => t.statusKey === statusKey && t.date === date);
  if (!existing) {
    app.timeline.push({ id: uid(), type: STATUS_MAP[statusKey].label, statusKey, date, notes });
  } else if (notes && !existing.notes) {
    existing.notes = notes;
  }
}

// Keeps the "Applied" timeline entry's date in sync when the person edits
// Date Applied directly on Overview, so the two never silently disagree.
function syncAppliedDate(app, date) {
  const entry = (app.timeline || []).find(t => t.statusKey === "applied");
  if (entry) entry.date = date;
}

// ------------------------------------------------------------------
// Toast + confirm dialog
// ------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); el.hidden = true; }, 2600);
}

function wireGlobalModals() {
  document.getElementById("confirm-cancel").addEventListener("click", () => closeModal("confirm-modal"));
  document.getElementById("confirm-ok").addEventListener("click", () => {
    const cb = State.confirmCallback;
    closeModal("confirm-modal");
    if (cb) cb();
  });
  document.getElementById("day-modal-close").addEventListener("click", () => closeModal("day-modal"));
  [confirmDialogOverlayHandlers, dayModalOverlayHandlers, appModalOverlayHandlers].forEach(fn => fn && fn());
}

function confirmDialogOverlayHandlers() {
  document.getElementById("confirm-modal").addEventListener("click", e => {
    if (e.target.id === "confirm-modal") closeModal("confirm-modal");
  });
}
function dayModalOverlayHandlers() {
  document.getElementById("day-modal").addEventListener("click", e => {
    if (e.target.id === "day-modal") closeModal("day-modal");
  });
}
function appModalOverlayHandlers() {
  document.getElementById("app-modal").addEventListener("click", e => {
    if (e.target.id === "app-modal") maybeCloseAppModal();
  });
}

function confirmDialog(message, onConfirm) {
  document.getElementById("confirm-message").textContent = message;
  State.confirmCallback = onConfirm;
  openModal("confirm-modal");
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ------------------------------------------------------------------
// Application modal — tabs, draft editing, save/delete
// ------------------------------------------------------------------
function wireModal() {
  document.querySelectorAll("#modal-tabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      State.activeTab = btn.dataset.tab;
      document.querySelectorAll("#modal-tabs .tab-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderModalBody();
    });
  });
  document.getElementById("modal-close").addEventListener("click", maybeCloseAppModal);
  document.getElementById("modal-cancel-btn").addEventListener("click", maybeCloseAppModal);
  document.getElementById("modal-save-btn").addEventListener("click", saveDraft);
  document.getElementById("modal-delete-btn").addEventListener("click", () => {
    confirmDialog(`Delete application for ${escapeHtml(State.draft.position) || "this role"} at ${escapeHtml(State.draft.company) || "this company"}?`, () => {
      Store.deleteApp(State.editingId);
      State.apps = Store.getApps();
      closeModal("app-modal");
      renderAll();
      toast("Application deleted");
    });
  });
}

function maybeCloseAppModal() {
  closeModal("app-modal");
  State.draft = null;
  State.editingId = null;
}

function openAppModal(id) {
  if (id) {
    State.draft = JSON.parse(JSON.stringify(Store.getApp(id)));
    State.editingId = id;
    document.getElementById("modal-title").textContent = State.draft.company ? `${State.draft.company} — ${State.draft.position || "Application"}` : "Edit application";
    document.getElementById("modal-delete-btn").hidden = false;
  } else {
    State.draft = emptyApplication();
    State.editingId = null;
    document.getElementById("modal-title").textContent = "New Application";
    document.getElementById("modal-delete-btn").hidden = true;
  }
  State.activeTab = "overview";
  document.querySelectorAll("#modal-tabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "overview"));
  renderModalBody();
  openModal("app-modal");
}

function saveDraft() {
  const d = State.draft;
  if (!d.company.trim() || !d.position.trim()) {
    toast("Company and position are required");
    State.activeTab = "overview";
    document.querySelectorAll("#modal-tabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === "overview"));
    renderModalBody();
    return;
  }
  Store.upsertApp(d);
  State.apps = Store.getApps();
  closeModal("app-modal");
  State.draft = null;
  State.editingId = null;
  renderAll();
  toast("Application saved");
}

function renderModalBody() {
  const body = document.getElementById("modal-body");
  body.innerHTML = "";
  const renderers = {
    overview: renderOverviewTab,
    timeline: renderTimelineTab,
    interviews: renderInterviewNotesTab,
    contacts: renderContactsTab,
    documents: renderDocumentsTab,
    tasks: renderTasksTab,
  };
  renderers[State.activeTab](body);
}

// ---- Overview tab --------------------------------------------------
function renderOverviewTab(container) {
  const d = State.draft;
  const statusOptions = STATUS_PIPELINE.map(s => `<option value="${s.key}" ${s.key === d.status ? "selected" : ""}>${s.label}</option>`).join("");
  const tags = getAllTags();

  container.innerHTML = `
    <div class="form-grid">
      <label>Company
        <input type="text" id="f-company" value="${escapeAttr(d.company)}" placeholder="e.g. Lockheed Martin" required>
      </label>
      <label>Position
        <input type="text" id="f-position" value="${escapeAttr(d.position)}" placeholder="e.g. Mechanical Design Engineer" required>
      </label>
      <label>Location
        <input type="text" id="f-location" value="${escapeAttr(d.location)}" placeholder="e.g. Fort Worth, TX / Remote">
      </label>
      <label>Status
        <select id="f-status">${statusOptions}</select>
      </label>
      <label>Date applied
        <input type="date" id="f-date" value="${d.dateApplied || ""}">
      </label>
      <label>Job posting URL
        <input type="url" id="f-url" value="${escapeAttr(d.jobUrl)}" placeholder="https://…">
      </label>
      <label class="checkbox-inline standalone">
        <input type="checkbox" id="f-favorite" ${d.favorite ? "checked" : ""}> Favorite company
      </label>
      <label>Fit rating
        <div class="star-input" id="f-rating">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-btn ${n <= d.rating ? "on" : ""}" data-n="${n}">★</button>`).join("")}
        </div>
      </label>
    </div>

    <fieldset class="fieldset">
      <legend>Salary</legend>
      <div class="form-grid">
        <label>Min <input type="number" id="f-sal-min" value="${d.salary?.min ?? ""}" placeholder="80000"></label>
        <label>Max <input type="number" id="f-sal-max" value="${d.salary?.max ?? ""}" placeholder="95000"></label>
        <label>Currency <input type="text" id="f-sal-cur" value="${escapeAttr(d.salary?.currency || "USD")}" maxlength="6"></label>
        <label>Per
          <select id="f-sal-period">
            ${SALARY_PERIODS.map(p => `<option value="${p}" ${d.salary?.period === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Tags</legend>
      <div class="chip-list" id="tag-chip-list">
        ${(d.tags || []).map(t => `<span class="tag-chip removable" data-tag="${escapeAttr(t)}">${escapeHtml(t)} <button type="button" class="chip-x" data-tag="${escapeAttr(t)}">✕</button></span>`).join("")}
      </div>
      <div class="inline-add">
        <input list="tag-suggestions" id="f-tag-input" placeholder="Add a tag and press Enter">
        <datalist id="tag-suggestions">${tags.map(t => `<option value="${escapeAttr(t)}">`).join("")}</datalist>
        <button type="button" class="btn-secondary" id="f-tag-add">Add</button>
      </div>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Application checklist</legend>
      <div class="checklist-grid">
        ${CHECKLIST_ITEMS.map(c => `
          <label class="checkbox-inline">
            <input type="checkbox" class="f-checklist" data-key="${c.key}" ${d.checklist?.[c.key] ? "checked" : ""}> ${c.label}
          </label>`).join("")}
      </div>
    </fieldset>

    <label class="stacked">Notes
      <textarea id="f-notes" rows="3" placeholder="Anything worth remembering…">${escapeHtml(d.notes)}</textarea>
    </label>

    <details class="jd-archive" ${d.jobDescription ? "open" : ""}>
      <summary>Job description archive <span class="muted">(saved so it's not lost when the listing is taken down)</span></summary>
      <textarea id="f-jd" rows="8" placeholder="Paste the full job description here…">${escapeHtml(d.jobDescription)}</textarea>
    </details>
  `;

  bind("#f-company", "input", e => d.company = e.target.value);
  bind("#f-position", "input", e => d.position = e.target.value);
  bind("#f-location", "input", e => d.location = e.target.value);
  bind("#f-status", "change", e => setStatus(d, e.target.value));
  bind("#f-date", "input", e => { d.dateApplied = e.target.value; syncAppliedDate(d, e.target.value); });
  bind("#f-url", "input", e => d.jobUrl = e.target.value);
  bind("#f-favorite", "change", e => d.favorite = e.target.checked);
  bind("#f-notes", "input", e => d.notes = e.target.value);
  bind("#f-jd", "input", e => d.jobDescription = e.target.value);
  bind("#f-sal-min", "input", e => (d.salary ||= {}).min = e.target.value);
  bind("#f-sal-max", "input", e => (d.salary ||= {}).max = e.target.value);
  bind("#f-sal-cur", "input", e => (d.salary ||= {}).currency = e.target.value);
  bind("#f-sal-period", "change", e => (d.salary ||= {}).period = e.target.value);

  container.querySelectorAll(".star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.n);
      d.rating = d.rating === n ? 0 : n; // click same star again to clear
      renderOverviewTab(container);
    });
  });

  container.querySelectorAll(".f-checklist").forEach(cb => {
    cb.addEventListener("change", e => {
      d.checklist = d.checklist || {};
      d.checklist[cb.dataset.key] = e.target.checked;
    });
  });

  const addTag = () => {
    const input = container.querySelector("#f-tag-input");
    const val = input.value.trim();
    if (!val) return;
    d.tags = d.tags || [];
    if (!d.tags.includes(val)) d.tags.push(val);
    input.value = "";
    renderOverviewTab(container);
  };
  container.querySelector("#f-tag-add").addEventListener("click", addTag);
  container.querySelector("#f-tag-input").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
  });
  container.querySelectorAll(".chip-x").forEach(btn => {
    btn.addEventListener("click", () => {
      d.tags = (d.tags || []).filter(t => t !== btn.dataset.tag);
      renderOverviewTab(container);
    });
  });

  function bind(sel, evt, handler) {
    container.querySelector(sel).addEventListener(evt, handler);
  }
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

// ---- Timeline tab ----------------------------------------------------
function renderTimelineTab(container) {
  const d = State.draft;
  const items = (d.timeline || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const statusOptions = STATUS_PIPELINE.map(s => `<option value="${s.key}">${s.label}</option>`).join("");

  container.innerHTML = `
    <div class="tab-list">
      ${items.length ? items.map(ev => `
        <div class="tab-list-item" data-id="${ev.id}">
          <div class="tli-main">
            <span class="tli-dot" style="background:${ev.statusKey ? STATUS_MAP[ev.statusKey].color : "var(--text-secondary)"}"></span>
            <strong>${escapeHtml(ev.type || "Event")}</strong>
            <span class="muted">${formatDate(ev.date)}</span>
          </div>
          ${ev.notes ? `<p class="tli-notes">${escapeHtml(ev.notes)}</p>` : ""}
          <button type="button" class="btn-ghost small remove-item" data-id="${ev.id}">Remove</button>
        </div>`).join("") : `<div class="chart-empty">No timeline events yet.</div>`}
    </div>

    <fieldset class="fieldset">
      <legend>Log an event</legend>
      <p class="hint tight">Logs history on the calendar for any date. If this is further along than the current status, it becomes the new status — but backfilling an earlier stage (handy when adding an application that's already in progress) won't drag the status backward. To deliberately move the status back, use the status field on Overview instead.</p>
      <div class="form-grid">
        <label>Status / event
          <select id="tl-type">${statusOptions}</select>
        </label>
        <label>Date
          <input type="date" id="tl-date" value="${todayISO()}">
        </label>
      </div>
      <label class="stacked">Notes
        <textarea id="tl-notes" rows="2" placeholder="Optional details…"></textarea>
      </label>
      <button type="button" class="btn-secondary" id="tl-add">Log event</button>
    </fieldset>
  `;
  container.querySelector(`#tl-type option[value="${d.status}"]`)?.setAttribute("selected", "selected");

  container.querySelectorAll(".remove-item").forEach(btn => {
    btn.addEventListener("click", () => {
      d.timeline = (d.timeline || []).filter(t => t.id !== btn.dataset.id);
      renderTimelineTab(container);
    });
  });

  container.querySelector("#tl-add").addEventListener("click", () => {
    const statusKey = container.querySelector("#tl-type").value;
    const date = container.querySelector("#tl-date").value || todayISO();
    const notes = container.querySelector("#tl-notes").value;
    logHistoricalEvent(d, statusKey, date, notes);
    renderTimelineTab(container);
    toast(`Logged "${STATUS_MAP[statusKey].label}" for ${formatDate(date)}`);
  });
}

// ---- Interview notes tab ---------------------------------------------
function renderInterviewNotesTab(container) {
  const d = State.draft;
  const items = (d.interviewNotes || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const intel = d.companyIntel || (d.companyIntel = { hq: "", glassdoorRating: "", size: "", interviewDifficulty: "Unknown" });

  container.innerHTML = `
    <fieldset class="fieldset">
      <legend>Company intelligence</legend>
      <p class="hint tight">Manually entered — Hermes runs fully offline. If you clip this job with Hermes Clipper, headquarters and company size fill in automatically whenever the posting includes that data.</p>
      <div class="form-grid">
        <label>Headquarters <input type="text" id="ci-hq" value="${escapeAttr(intel.hq)}" placeholder="e.g. Bethesda, MD"></label>
        <label>Glassdoor rating <input type="number" id="ci-glassdoor" value="${escapeAttr(intel.glassdoorRating)}" min="1" max="5" step="0.1" placeholder="e.g. 3.8"></label>
        <label>Company size <input type="text" id="ci-size" value="${escapeAttr(intel.size)}" placeholder="e.g. 10,000+ employees"></label>
        <label>Interview difficulty
          <select id="ci-difficulty">
            ${INTERVIEW_DIFFICULTY_LEVELS.map(lvl => `<option value="${lvl}" ${intel.interviewDifficulty === lvl ? "selected" : ""}>${lvl}</option>`).join("")}
          </select>
        </label>
      </div>
    </fieldset>

    <div class="tab-list">
      ${items.length ? items.map(n => `
        <div class="tab-list-item" data-id="${n.id}">
          <div class="tli-main"><strong>${escapeHtml(n.title)}</strong><span class="muted">${formatDate(n.date)}</span></div>
          ${n.notes ? `<p class="tli-notes">${escapeHtml(n.notes)}</p>` : ""}
          <button type="button" class="btn-ghost small remove-item" data-id="${n.id}">Remove</button>
        </div>`).join("") : `<div class="chart-empty">No interview notes yet.</div>`}
    </div>
    <fieldset class="fieldset">
      <legend>Add interview note</legend>
      <div class="form-grid">
        <label>Round / title <input type="text" id="in-title" placeholder="e.g. Onsite — Panel with hiring manager"></label>
        <label>Date <input type="date" id="in-date" value="${todayISO()}"></label>
      </div>
      <label class="stacked">Notes <textarea id="in-notes" rows="3" placeholder="Questions asked, impressions, follow-ups…"></textarea></label>
      <button type="button" class="btn-secondary" id="in-add">Add note</button>
    </fieldset>
  `;

  bindIntel("#ci-hq", "hq");
  bindIntel("#ci-glassdoor", "glassdoorRating");
  bindIntel("#ci-size", "size");
  container.querySelector("#ci-difficulty").addEventListener("change", e => { intel.interviewDifficulty = e.target.value; });

  function bindIntel(sel, key) {
    container.querySelector(sel).addEventListener("input", e => { intel[key] = e.target.value; });
  }

  container.querySelectorAll(".remove-item").forEach(btn => {
    btn.addEventListener("click", () => {
      d.interviewNotes = (d.interviewNotes || []).filter(n => n.id !== btn.dataset.id);
      renderInterviewNotesTab(container);
    });
  });
  container.querySelector("#in-add").addEventListener("click", () => {
    const title = container.querySelector("#in-title").value.trim();
    if (!title) return toast("Give the note a title first");
    const date = container.querySelector("#in-date").value;
    const notes = container.querySelector("#in-notes").value;
    d.interviewNotes = d.interviewNotes || [];
    d.interviewNotes.push({ id: uid(), title, date, notes });
    renderInterviewNotesTab(container);
  });
}

// ---- Contacts tab ------------------------------------------------------
function renderContactsTab(container) {
  const d = State.draft;
  const items = d.contacts || [];

  container.innerHTML = `
    <div class="tab-list">
      ${items.length ? items.map(c => `
        <div class="tab-list-item" data-id="${c.id}">
          <div class="tli-main"><strong>${escapeHtml(c.name)}</strong><span class="muted">${escapeHtml(c.role || "")}</span></div>
          <p class="tli-notes">${[c.email, c.phone, c.linkedin].filter(Boolean).map(escapeHtml).join(" · ")}</p>
          ${c.notes ? `<p class="tli-notes">${escapeHtml(c.notes)}</p>` : ""}
          <button type="button" class="btn-ghost small remove-item" data-id="${c.id}">Remove</button>
        </div>`).join("") : `<div class="chart-empty">No contacts yet.</div>`}
    </div>
    <fieldset class="fieldset">
      <legend>Add contact</legend>
      <div class="form-grid">
        <label>Name <input type="text" id="ct-name" placeholder="Jane Doe"></label>
        <label>Role <input type="text" id="ct-role" placeholder="Recruiter / Hiring Manager"></label>
        <label>Email <input type="email" id="ct-email" placeholder="jane@company.com"></label>
        <label>Phone <input type="tel" id="ct-phone" placeholder="(555) 555-5555"></label>
        <label>LinkedIn <input type="url" id="ct-linkedin" placeholder="https://linkedin.com/in/…"></label>
      </div>
      <label class="stacked">Notes <textarea id="ct-notes" rows="2"></textarea></label>
      <button type="button" class="btn-secondary" id="ct-add">Add contact</button>
    </fieldset>
  `;

  container.querySelectorAll(".remove-item").forEach(btn => {
    btn.addEventListener("click", () => {
      d.contacts = (d.contacts || []).filter(c => c.id !== btn.dataset.id);
      renderContactsTab(container);
    });
  });
  container.querySelector("#ct-add").addEventListener("click", () => {
    const name = container.querySelector("#ct-name").value.trim();
    if (!name) return toast("Contact needs a name");
    d.contacts = d.contacts || [];
    d.contacts.push({
      id: uid(), name,
      role: container.querySelector("#ct-role").value,
      email: container.querySelector("#ct-email").value,
      phone: container.querySelector("#ct-phone").value,
      linkedin: container.querySelector("#ct-linkedin").value,
      notes: container.querySelector("#ct-notes").value,
    });
    renderContactsTab(container);
  });
}

// ---- Documents tab -------------------------------------------------
function renderDocumentsTab(container) {
  const d = State.draft;
  const items = d.documents || [];
  const resumeVersions = State.settings.resumeVersions || [];
  const coverVersions = State.settings.coverLetterVersions || [];
  const match = d.matchInfo;

  container.innerHTML = `
    <div class="form-grid">
      <label>Resume version used
        <select id="doc-resume-version">
          <option value="">— none selected —</option>
          ${resumeVersions.map(v => `<option value="${escapeAttr(v.name)}" ${d.resumeVersion === v.name ? "selected" : ""}>${escapeHtml(v.name)}${v.text ? "" : " (no text saved)"}</option>`).join("")}
        </select>
      </label>
      <label>Cover letter version used
        <select id="doc-cover-version">
          <option value="">— none selected —</option>
          ${coverVersions.map(v => `<option value="${escapeAttr(v.name)}" ${d.coverLetterVersion === v.name ? "selected" : ""}>${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
    </div>
    <p class="hint">Manage the master list of versions — and paste the actual resume text in for match scoring — in Settings → Resume &amp; cover letter library.</p>

    <fieldset class="fieldset">
      <legend>Resume ↔ job description match</legend>
      ${match ? `
        <div class="match-summary">
          <span class="stars" title="Match score">${"★".repeat(match.score)}${"☆".repeat(5 - match.score)}</span>
          <span class="muted">${match.ratio}% of top job-description keywords found in this resume</span>
        </div>
        ${match.present.length ? `<p class="match-label">Present</p><div class="chip-list">${match.present.map(k => `<span class="tag-chip match-present">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        ${match.missing.length ? `<p class="match-label">Missing</p><div class="chip-list">${match.missing.map(k => `<span class="tag-chip match-missing">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        <p class="hint tight">Sets the Overview fit rating automatically — feel free to overwrite it there afterward.</p>
      ` : `<p class="hint tight">Select a resume version with saved text and paste a job description on Overview, then analyze the match. Runs fully offline — a lightweight keyword and phrase matcher, not a language model.</p>`}
      <button type="button" class="btn-secondary" id="analyze-match-btn">${match ? "Re-analyze" : "Analyze match"}</button>
    </fieldset>

    <div class="tab-list">
      ${items.length ? items.map(doc => `
        <div class="tab-list-item" data-id="${doc.id}">
          <div class="tli-main"><strong>${escapeHtml(doc.name)}</strong><span class="muted">${escapeHtml(doc.type)}</span></div>
          ${doc.link ? `<p class="tli-notes"><a href="${escapeAttr(doc.link)}" target="_blank" rel="noopener">${escapeHtml(doc.link)}</a></p>` : ""}
          ${doc.notes ? `<p class="tli-notes">${escapeHtml(doc.notes)}</p>` : ""}
          <button type="button" class="btn-ghost small remove-item" data-id="${doc.id}">Remove</button>
        </div>`).join("") : `<div class="chart-empty">No additional documents logged.</div>`}
    </div>
    <fieldset class="fieldset">
      <legend>Add document reference</legend>
      <div class="form-grid">
        <label>Name <input type="text" id="dc-name" placeholder="e.g. Portfolio PDF"></label>
        <label>Type
          <select id="dc-type">${DOCUMENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
        </label>
      </div>
      <label>Link <input type="url" id="dc-link" placeholder="https://… (Drive, Dropbox, portfolio site, etc.)"></label>
      <label class="stacked">Notes <textarea id="dc-notes" rows="2"></textarea></label>
      <button type="button" class="btn-secondary" id="dc-add">Add document</button>
    </fieldset>
  `;

  container.querySelector("#doc-resume-version").addEventListener("change", e => d.resumeVersion = e.target.value);
  container.querySelector("#doc-cover-version").addEventListener("change", e => d.coverLetterVersion = e.target.value);

  container.querySelector("#analyze-match-btn").addEventListener("click", () => {
    const resume = resumeVersions.find(v => v.name === d.resumeVersion);
    if (!resume || !resume.text) {
      toast("Pick a resume version that has saved text (Settings → Resume library) first");
      return;
    }
    if (!d.jobDescription) {
      toast("Paste the job description on the Overview tab first");
      return;
    }
    d.matchInfo = Analytics.computeMatch(resume.text, d.jobDescription);
    d.rating = d.matchInfo.score;
    renderDocumentsTab(container);
    toast(`Match analyzed: ${d.matchInfo.score}/5`);
  });

  container.querySelectorAll(".remove-item").forEach(btn => {
    btn.addEventListener("click", () => {
      d.documents = (d.documents || []).filter(x => x.id !== btn.dataset.id);
      renderDocumentsTab(container);
    });
  });
  container.querySelector("#dc-add").addEventListener("click", () => {
    const name = container.querySelector("#dc-name").value.trim();
    if (!name) return toast("Document needs a name");
    d.documents = d.documents || [];
    d.documents.push({
      id: uid(), name,
      type: container.querySelector("#dc-type").value,
      link: container.querySelector("#dc-link").value,
      notes: container.querySelector("#dc-notes").value,
    });
    renderDocumentsTab(container);
  });
}

// ---- Tasks tab -----------------------------------------------------
function renderTasksTab(container) {
  const d = State.draft;
  const items = (d.tasks || []).slice().sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  container.innerHTML = `
    <div class="tab-list">
      ${items.length ? items.map(t => `
        <div class="tab-list-item task-item ${t.done ? "done" : ""}" data-id="${t.id}">
          <label class="checkbox-inline">
            <input type="checkbox" class="task-done" data-id="${t.id}" ${t.done ? "checked" : ""}>
            <strong>${escapeHtml(t.title)}</strong>
          </label>
          <span class="muted">${t.dueDate ? "Due " + formatDate(t.dueDate) : "No due date"}</span>
          <button type="button" class="btn-ghost small remove-item" data-id="${t.id}">Remove</button>
        </div>`).join("") : `<div class="chart-empty">No tasks yet — add follow-ups, prep reminders, or deadlines.</div>`}
    </div>
    <fieldset class="fieldset">
      <legend>Add task</legend>
      <div class="form-grid">
        <label>Title <input type="text" id="tk-title" placeholder="e.g. Send thank-you email"></label>
        <label>Due date <input type="date" id="tk-date"></label>
      </div>
      <button type="button" class="btn-secondary" id="tk-add">Add task</button>
    </fieldset>
  `;

  container.querySelectorAll(".task-done").forEach(cb => {
    cb.addEventListener("change", e => {
      const task = (d.tasks || []).find(t => t.id === cb.dataset.id);
      if (task) task.done = e.target.checked;
      renderTasksTab(container);
    });
  });
  container.querySelectorAll(".remove-item").forEach(btn => {
    btn.addEventListener("click", () => {
      d.tasks = (d.tasks || []).filter(t => t.id !== btn.dataset.id);
      renderTasksTab(container);
    });
  });
  container.querySelector("#tk-add").addEventListener("click", () => {
    const title = container.querySelector("#tk-title").value.trim();
    if (!title) return toast("Task needs a title");
    d.tasks = d.tasks || [];
    d.tasks.push({ id: uid(), title, dueDate: container.querySelector("#tk-date").value, done: false });
    renderTasksTab(container);
  });
}

// ------------------------------------------------------------------
// Calendar view
// ------------------------------------------------------------------
function wireCalendar() {
  document.getElementById("export-ics-btn").addEventListener("click", () => {
    const ics = Analytics.buildICS(State.apps);
    downloadFile("hermes-calendar.ics", ics, "text/calendar");
    toast("Calendar file downloaded — import it into Outlook, Google, or Apple Calendar");
  });
}

function renderCalendarView() {
  const container = document.getElementById("calendar-container");
  CalendarView.render(container, State.apps, (dateStr, events) => openDayModal(dateStr, events));
  renderUpcomingList(document.getElementById("calendar-upcoming"), CalendarView.upcomingReminders(State.apps));
}

function openDayModal(dateStr, events) {
  document.getElementById("day-modal-title").textContent = formatDate(dateStr);
  const body = document.getElementById("day-modal-body");
  if (!events.length) {
    body.innerHTML = `<div class="chart-empty">Nothing scheduled this day.</div>`;
  } else {
    body.innerHTML = events.map(e => {
      const taskIcon = e.kind === "task"
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="day-modal-icon"><polyline points="20 6 9 17 4 12"/></svg>`
        : "";
      const doneClass = e.kind === "task" && e.done ? " done" : "";
      return `
      <div class="upcoming-item${doneClass}" data-app-id="${e.appId}">
        <span class="upcoming-badge ${e.kind}">${taskIcon}${e.kind === "task" ? "Task" : "Event"}</span>
        <span class="upcoming-label">${escapeHtml(e.label)}</span>
        <span class="upcoming-company muted">${escapeHtml(e.company)}</span>
      </div>`;
    }).join("");
    body.querySelectorAll(".upcoming-item").forEach(el => {
      el.addEventListener("click", () => { closeModal("day-modal"); openAppModal(el.dataset.appId); });
    });
  }
  openModal("day-modal");
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------
// Kanban board — drag-and-drop status pipeline
// ------------------------------------------------------------------
const KanbanAutoScroll = {
  board: null,
  edgeZone: 110,     // px inside the board edge where scrolling starts
  outsideZone: 180,  // px beyond the board edge where scrolling still engages
  maxSpeed: 26,
  dir: 0,
  raf: null,

  init(board) {
    this.board = board;
    this._onDragOver = this._onDragOver.bind(this);
    this._stop = this._stop.bind(this);
  },

  start() {
    if (!this.board) return;
    document.addEventListener("dragover", this._onDragOver);
    document.addEventListener("dragend", this._stop);
    document.addEventListener("drop", this._stop);
  },

  _onDragOver(e) {
    const rect = this.board.getBoundingClientRect();
    const x = e.clientX;
    const span = this.edgeZone + this.outsideZone;
    if (x < rect.left + this.edgeZone && x > rect.left - this.outsideZone) {
      const dist = Math.min(Math.max(x - (rect.left - this.outsideZone), 0), span);
      this.dir = -Math.max(4, Math.ceil(this.maxSpeed * (1 - dist / span)));
    } else if (x > rect.right - this.edgeZone && x < rect.right + this.outsideZone) {
      const dist = Math.min(Math.max((rect.right + this.outsideZone) - x, 0), span);
      this.dir = Math.max(4, Math.ceil(this.maxSpeed * (1 - dist / span)));
    } else {
      this.dir = 0;
    }
    if (this.dir !== 0 && !this.raf) this._tick();
  },

  _tick() {
    if (this.dir !== 0) {
      this.board.scrollLeft += this.dir;
      this.raf = requestAnimationFrame(() => this._tick());
    } else {
      this.raf = null;
    }
  },

  _stop() {
    this.dir = 0;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    document.removeEventListener("dragover", this._onDragOver);
    document.removeEventListener("dragend", this._stop);
    document.removeEventListener("drop", this._stop);
  },
};

function wireKanban() {
  const board = document.getElementById("kanban-board");
  KanbanAutoScroll.init(board);

  // Let the mouse wheel scroll the board horizontally (most wheels only
  // report vertical delta, so translate that into horizontal scroll).
  board.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      board.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
}

function renderKanbanView() {
  const board = document.getElementById("kanban-board");
  board.innerHTML = STATUS_PIPELINE.map(s => {
    const apps = State.apps.filter(a => a.status === s.key);
    return `
      <div class="kanban-column">
        <div class="kanban-col-head" style="--status-color:${s.color}">
          <span class="kanban-col-dot"></span>
          <h3>${s.label}</h3>
          <span class="kanban-col-count">${apps.length}</span>
        </div>
        <div class="kanban-col-body" data-status="${s.key}">
          ${apps.map(renderKanbanCard).join("") || `<div class="kanban-empty">Drop here</div>`}
        </div>
      </div>`;
  }).join("");

  wireKanbanDnD(board);
}

function renderKanbanCard(app) {
  const stars = app.rating ? `<span class="stars small">${"★".repeat(app.rating)}</span>` : "";
  const openTasks = (app.tasks || []).filter(t => !t.done).length;
  return `
    <div class="kanban-card" draggable="true" data-id="${app.id}">
      <div class="kanban-card-top">
        <strong>${escapeHtml(app.company) || "Untitled"}</strong>
        ${app.favorite ? `<span class="kanban-fav" title="Favorite">★</span>` : ""}
      </div>
      <p class="muted">${escapeHtml(app.position) || "—"}</p>
      <div class="kanban-card-meta">
        ${stars}
        ${app.dateApplied ? `<span class="muted">${formatDate(app.dateApplied)}</span>` : ""}
        ${openTasks ? `<span class="kanban-task-badge">${openTasks} task${openTasks === 1 ? "" : "s"}</span>` : ""}
      </div>
    </div>`;
}

function wireKanbanDnD(board) {
  board.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.id);
      KanbanAutoScroll.start();
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      KanbanAutoScroll._stop();
    });
    card.addEventListener("click", () => openAppModal(card.dataset.id));
  });

  board.querySelectorAll(".kanban-col-body").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const newStatus = col.dataset.status;
      const app = Store.getApp(id);
      if (app && app.status !== newStatus) {
        setStatus(app, newStatus);
        Store.upsertApp(app);
        State.apps = Store.getApps();
        renderKanbanView();
        toast(`Moved ${app.company || "application"} to ${STATUS_MAP[newStatus].label}`);
      }
    });
  });
}

// ------------------------------------------------------------------
// Settings view
// ------------------------------------------------------------------
function wireSettings() {
  document.getElementById("settings-theme-check").addEventListener("change", e => {
    const theme = e.target.checked ? "light" : "dark";
    State.settings.theme = theme;
    Store.updateSettings({ theme });
    applyTheme(theme);
  });

  document.getElementById("resume-lib-add").addEventListener("click", () => addLibraryItem("resumeVersions", "resume-lib-input"));
  document.getElementById("cover-lib-add").addEventListener("click", () => addLibraryItem("coverLetterVersions", "cover-lib-input"));
  document.getElementById("custom-tag-add").addEventListener("click", () => addLibraryItem("customTags", "custom-tag-input"));

  document.getElementById("export-json-btn").addEventListener("click", () => {
    downloadFile(`hermes-backup-${todayISO()}.json`, Store.exportJSON(), "application/json");
    toast("Backup downloaded");
  });
  document.getElementById("import-json-input").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      confirmDialog("Import this backup? It will replace all current data in this browser.", () => {
        Store.importJSON(text);
        State.apps = Store.getApps();
        State.settings = Store.getSettings();
        applyTheme(State.settings.theme);
        renderAll();
        toast("Backup imported");
      });
    } catch (err) {
      toast("Couldn't read that file — is it a valid Hermes backup?");
    }
    e.target.value = "";
  });
  document.getElementById("clear-data-btn").addEventListener("click", () => {
    confirmDialog("Delete ALL applications and settings from this browser? This cannot be undone.", () => {
      Store.deleteApps(State.apps.map(a => a.id));
      Store.updateSettings(DEFAULT_SETTINGS);
      State.apps = Store.getApps();
      State.settings = Store.getSettings();
      applyTheme(State.settings.theme);
      renderAll();
      toast("All data deleted");
    });
  });
}

function addLibraryItem(settingsKey, inputId) {
  const input = document.getElementById(inputId);
  const val = input.value.trim();
  if (!val) return;
  const list = State.settings[settingsKey] || [];
  if (settingsKey === "customTags") {
    if (!list.includes(val)) list.push(val);
  } else {
    if (!list.some(v => v.name === val)) list.push({ id: uid(), name: val, text: "" });
  }
  Store.updateSettings({ [settingsKey]: list });
  State.settings = Store.getSettings();
  input.value = "";
  renderSettingsPanel();
}

function removeLibraryItem(settingsKey, val) {
  const list = settingsKey === "customTags"
    ? (State.settings[settingsKey] || []).filter(v => v !== val)
    : (State.settings[settingsKey] || []).filter(v => v.id !== val);
  Store.updateSettings({ [settingsKey]: list });
  State.settings = Store.getSettings();
  renderSettingsPanel();
}

function renderSettingsPanel() {
  document.getElementById("settings-theme-check").checked = State.settings.theme === "light";
  renderVersionLibrary("resume-lib-list", State.settings.resumeVersions, "resumeVersions");
  renderVersionLibrary("cover-lib-list", State.settings.coverLetterVersions, "coverLetterVersions");
  renderChipEditor("custom-tag-list", State.settings.customTags, "customTags");
}

function renderChipEditor(containerId, items, settingsKey) {
  const el = document.getElementById(containerId);
  if (!items || !items.length) { el.innerHTML = `<span class="muted">None yet</span>`; return; }
  el.innerHTML = items.map(v => `
    <span class="tag-chip removable">${escapeHtml(v)} <button type="button" class="chip-x" data-val="${escapeAttr(v)}">✕</button></span>
  `).join("");
  el.querySelectorAll(".chip-x").forEach(btn => {
    btn.addEventListener("click", () => removeLibraryItem(settingsKey, btn.dataset.val));
  });
}

// Resume/cover-letter versions are richer than a plain tag: each can carry
// its actual document text (used by the resume ↔ job description match
// feature), so each entry gets an expandable textarea instead of just a chip.
function renderVersionLibrary(containerId, items, settingsKey) {
  const el = document.getElementById(containerId);
  if (!items || !items.length) { el.innerHTML = `<p class="muted">None yet</p>`; return; }
  el.innerHTML = items.map(v => `
    <div class="version-item" data-id="${v.id}">
      <div class="version-item-head">
        <span>${escapeHtml(v.name)}</span>
        <span class="muted">${v.text ? `${v.text.trim().split(/\s+/).length} words saved` : "no text saved"}</span>
        <button type="button" class="btn-ghost small toggle-text-btn" data-id="${v.id}">${v.text ? "Edit text" : "Paste text"}</button>
        <button type="button" class="chip-x remove-version-btn" data-id="${v.id}">✕</button>
      </div>
      <textarea class="version-text-area" data-id="${v.id}" hidden placeholder="Paste the full resume text for this version — used to score matches against job descriptions.">${escapeHtml(v.text || "")}</textarea>
    </div>
  `).join("");

  el.querySelectorAll(".toggle-text-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const area = el.querySelector(`.version-text-area[data-id="${btn.dataset.id}"]`);
      area.hidden = !area.hidden;
      if (!area.hidden) area.focus();
    });
  });
  el.querySelectorAll(".version-text-area").forEach(area => {
    area.addEventListener("change", () => {
      const list = State.settings[settingsKey];
      const item = list.find(v => v.id === area.dataset.id);
      if (item) { item.text = area.value; Store.updateSettings({ [settingsKey]: list }); State.settings = Store.getSettings(); renderVersionLibrary(containerId, State.settings[settingsKey], settingsKey); }
    });
  });
  el.querySelectorAll(".remove-version-btn").forEach(btn => {
    btn.addEventListener("click", () => removeLibraryItem(settingsKey, btn.dataset.id));
  });
}
