/* ===========================================================
   calendar.js — month grid view, day agenda, reminders
   =========================================================== */

const CalendarView = {
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

  buildEventIndex(apps) {
    // map "YYYY-MM-DD" -> array of {label, color, app, kind}
    const index = {};
    const push = (date, entry) => {
      if (!date) return;
      (index[date] ||= []).push(entry);
    };
    apps.forEach(app => {
      (app.tasks || []).forEach(task => {
        if (task.dueDate) {
          push(task.dueDate, {
            kind: "task", label: task.title, done: task.done,
            company: app.company, appId: app.id, color: task.done ? "#64748b" : "#ec4899",
          });
        }
      });
      (app.timeline || []).forEach(ev => {
        if (ev.date) {
          const statusCfg = STATUS_MAP[ev.statusKey];
          push(ev.date, {
            kind: "event", label: ev.type, company: app.company, appId: app.id,
            color: statusCfg ? statusCfg.color : "#3b82f6",
          });
        }
      });
    });
    return index;
  },

  render(container, apps, onDayClick) {
    const idx = this.buildEventIndex(apps);
    const year = this.cursor.getFullYear();
    const month = this.cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthLabel = firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const todayStr = todayISO();

    const MAX_VISIBLE = 3;
    let cells = "";
    for (let i = 0; i < startOffset; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const events = idx[dateStr] || [];
      const isToday = dateStr === todayStr;
      const chips = events.slice(0, MAX_VISIBLE).map(e => {
        const taskIcon = e.kind === "task"
          ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="cal-chip-icon"><polyline points="20 6 9 17 4 12"/></svg>`
          : "";
        const doneClass = e.kind === "task" && e.done ? " done" : "";
        return `
        <span class="cal-event-chip ${e.kind}${doneClass}" style="background:color-mix(in srgb, ${e.color} 22%, transparent); color:${e.color}" title="${escapeHtml(e.label)} — ${escapeHtml(e.company)}">${taskIcon}${escapeHtml(e.label)}</span>
      `;
      }).join("");
      cells += `
        <div class="cal-cell${isToday ? " today" : ""}${events.length ? " has-events" : ""}" data-date="${dateStr}">
          <div class="cal-daynum">${day}</div>
          <div class="cal-chips">${chips}</div>
          ${events.length > MAX_VISIBLE ? `<div class="cal-more">+${events.length - MAX_VISIBLE} more</div>` : ""}
        </div>`;
    }

    container.innerHTML = `
      <div class="cal-header">
        <button class="btn-icon" id="cal-prev">‹</button>
        <h3>${monthLabel}</h3>
        <button class="btn-icon" id="cal-next">›</button>
        <button class="btn-secondary" id="cal-today">Today</button>
      </div>
      <div class="cal-grid cal-dow">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div class="cal-grid">${cells}</div>
    `;

    container.querySelector("#cal-prev").onclick = () => { this.cursor.setMonth(this.cursor.getMonth() - 1); this.render(container, apps, onDayClick); };
    container.querySelector("#cal-next").onclick = () => { this.cursor.setMonth(this.cursor.getMonth() + 1); this.render(container, apps, onDayClick); };
    container.querySelector("#cal-today").onclick = () => { this.cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); this.render(container, apps, onDayClick); };

    container.querySelectorAll(".cal-cell[data-date]").forEach(cell => {
      cell.addEventListener("click", () => onDayClick(cell.dataset.date, idx[cell.dataset.date] || []));
    });
  },

  // Reminders = every incomplete task (whether overdue or upcoming — a task
  // still needing done is worth surfacing regardless of its date, or even if
  // it has no date at all) plus any timeline event dated in the future.
  upcomingReminders(apps) {
    const today = todayISO();
    const items = [];
    apps.forEach(app => {
      (app.tasks || []).forEach(task => {
        if (task.done) return;
        items.push({ date: task.dueDate || "", label: task.title, company: app.company, appId: app.id, kind: "task" });
      });
      (app.timeline || []).forEach(ev => {
        if (!ev.date || ev.date <= today) return;
        items.push({ date: ev.date, label: ev.type, company: app.company, appId: app.id, kind: "event" });
      });
    });
    // Undated tasks sort first (nothing to compare, but they still need doing),
    // then everything else chronologically.
    return items.sort((a, b) => (a.date || "0000-00-00").localeCompare(b.date || "0000-00-00"));
  },
};

// escapeHtml() is defined once in app.js and reused here.
