/* ===========================================================
   analytics.js — dashboard metrics, chart data prep, ICS export
   =========================================================== */

const Analytics = {

  // ---- Core counts -----------------------------------------------------
  computeStats(apps) {
    const submitted = apps.filter(a => !["wishlist", "preparing"].includes(a.status));
    const interviews = apps.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES));
    const offers = apps.filter(a => this.hasReachedAny(a, OUTCOME_POSITIVE));
    const responded = submitted.filter(a => this.hasResponse(a));
    const rejected = apps.filter(a => a.status === "rejected");

    const responseRate = submitted.length ? Math.round((responded.length / submitted.length) * 100) : 0;

    const avgDaysToResponse = this.average(
      submitted.map(a => this.daysToResponse(a)).filter(v => v != null)
    );
    const avgDaysToRejection = this.average(
      rejected.map(a => this.daysToRejection(a)).filter(v => v != null)
    );

    return {
      total: apps.length,
      submitted: submitted.length,
      interviews: interviews.length,
      offers: offers.length,
      responseRate,
      avgDaysToResponse,
      avgDaysToRejection,
      perWeek: this.applicationsThisWeek(apps),
      streak: this.currentStreak(apps),
    };
  },

  hasReachedAny(app, keys) {
    const set = new Set(keys);
    if (set.has(app.status)) return true;
    return (app.timeline || []).some(t => set.has(t.statusKey));
  },

  // "Responded" = anything progressed beyond bare Applied, OR explicitly closed with signal (rejected/offer)
  hasResponse(app) {
    if (["rejected", "offer", "accepted"].includes(app.status)) return true;
    if (this.hasReachedAny(app, INTERVIEW_STATUSES)) return true;
    return (app.timeline || []).some(t => t.statusKey && t.statusKey !== "applied" && t.statusKey !== "wishlist" && t.statusKey !== "preparing");
  },

  firstEventDate(app, statusKey) {
    const ev = (app.timeline || []).find(t => t.statusKey === statusKey);
    return ev ? ev.date : (statusKey === "applied" ? app.dateApplied : null);
  },

  daysToResponse(app) {
    const appliedDate = app.dateApplied || this.firstEventDate(app, "applied");
    if (!appliedDate) return null;
    const events = (app.timeline || [])
      .filter(t => t.date && t.date > appliedDate && t.statusKey !== "applied")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!events.length) return null;
    return daysBetween(appliedDate, events[0].date);
  },

  daysToRejection(app) {
    const appliedDate = app.dateApplied || this.firstEventDate(app, "applied");
    const rejEvent = this.firstEventDate(app, "rejected");
    if (!appliedDate || !rejEvent) return null;
    return daysBetween(appliedDate, rejEvent);
  },

  average(arr) {
    if (!arr.length) return null;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  },

  applicationsThisWeek(apps) {
    const start = this.startOfWeek(new Date());
    return apps.filter(a => a.dateApplied && new Date(a.dateApplied + "T00:00:00") >= start).length;
  },

  startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
  },

  // Consecutive days (ending today or yesterday) with >=1 application dateApplied logged
  currentStreak(apps) {
    const dates = new Set(apps.filter(a => a.dateApplied).map(a => a.dateApplied));
    if (!dates.size) return 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    // allow streak to still "count" if today has no entry yet but yesterday does
    if (!dates.has(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  // ---- Chart data --------------------------------------------------------
  weeklySeries(apps, weeks = 12) {
    const buckets = [];
    const start = this.startOfWeek(new Date());
    for (let i = weeks - 1; i >= 0; i--) {
      const wkStart = new Date(start);
      wkStart.setDate(wkStart.getDate() - i * 7);
      const wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 7);
      const count = apps.filter(a => {
        if (!a.dateApplied) return false;
        const d = new Date(a.dateApplied + "T00:00:00");
        return d >= wkStart && d < wkEnd;
      }).length;
      buckets.push({ label: `${wkStart.getMonth() + 1}/${wkStart.getDate()}`, value: count });
    }
    return buckets;
  },

  monthlySeries(apps, months = 6) {
    const buckets = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = m.toLocaleDateString(undefined, { month: "short" });
      const count = apps.filter(a => {
        if (!a.dateApplied) return false;
        const d = new Date(a.dateApplied + "T00:00:00");
        return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
      }).length;
      buckets.push({ label, value: count });
    }
    return buckets;
  },

  statusDistribution(apps) {
    return STATUS_PIPELINE.map(s => ({
      key: s.key, label: s.label, color: s.color,
      value: apps.filter(a => a.status === s.key).length,
    })).filter(s => s.value > 0);
  },

  // ---- ICS calendar export ------------------------------------------------
  buildICS(apps) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobAppTracker//EN", "CALSCALE:GREGORIAN"];
    const stamp = (d) => d.replace(/-/g, "");

    apps.forEach(app => {
      (app.tasks || []).forEach(task => {
        if (!task.dueDate) return;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${app.id}-task-${task.id}@jobapptracker`);
        lines.push(`DTSTAMP:${stamp(todayISO())}T000000Z`);
        lines.push(`DTSTART;VALUE=DATE:${stamp(task.dueDate)}`);
        lines.push(`SUMMARY:${icsEscape((task.done ? "[Done] " : "") + task.title + " — " + app.company)}`);
        lines.push(`DESCRIPTION:${icsEscape(`Task for ${app.position} at ${app.company}`)}`);
        lines.push("END:VEVENT");
      });
      (app.timeline || []).forEach(ev => {
        if (!ev.date || !INTERVIEW_STATUSES.includes(ev.statusKey)) return;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${app.id}-tl-${ev.id}@jobapptracker`);
        lines.push(`DTSTAMP:${stamp(todayISO())}T000000Z`);
        lines.push(`DTSTART;VALUE=DATE:${stamp(ev.date)}`);
        lines.push(`SUMMARY:${icsEscape(ev.label + " — " + app.company)}`);
        lines.push(`DESCRIPTION:${icsEscape(`${app.position} at ${app.company}. ${ev.notes || ""}`)}`);
        lines.push("END:VEVENT");
      });
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  },
};

function icsEscape(str) {
  return String(str).replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
}
