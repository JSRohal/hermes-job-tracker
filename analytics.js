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
      avgSalary: this.averageSalary(apps),
      openTasks: this.openTaskCount(apps),
    };
  },

  openTaskCount(apps) {
    return apps.reduce((sum, a) => sum + (a.tasks || []).filter(t => !t.done).length, 0);
  },

  // Normalizes every application's salary to an annual figure (hourly * 2080)
  // so mixed year/hour entries can be averaged together, then formats it back
  // into a readable "$X/yr" style string using the most common currency used.
  averageSalary(apps) {
    const points = [];
    let currency = "USD";
    apps.forEach(a => {
      const s = a.salary;
      if (!s) return;
      const min = parseFloat(s.min), max = parseFloat(s.max);
      const vals = [min, max].filter(v => !isNaN(v) && v > 0);
      if (!vals.length) return;
      let mid = vals.reduce((x, y) => x + y, 0) / vals.length;
      if (s.period === "hour") mid = mid * 2080; // full-time annualized
      points.push(mid);
      if (s.currency) currency = s.currency;
    });
    if (!points.length) return null;
    const avg = points.reduce((a, b) => a + b, 0) / points.length;
    return { amount: Math.round(avg), currency };
  },

  formatSalary(avgSalary) {
    if (!avgSalary) return "—";
    const amt = avgSalary.amount;
    const short = amt >= 1000 ? `${Math.round(amt / 1000)}k` : String(amt);
    const symbol = avgSalary.currency === "USD" ? "$" : avgSalary.currency + " ";
    return `${symbol}${short}/yr`;
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
        if (!ev.date || ev.date <= todayISO()) return; // only future-scheduled events belong on a calendar export
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${app.id}-tl-${ev.id}@jobapptracker`);
        lines.push(`DTSTAMP:${stamp(todayISO())}T000000Z`);
        lines.push(`DTSTART;VALUE=DATE:${stamp(ev.date)}`);
        lines.push(`SUMMARY:${icsEscape(ev.type + " — " + app.company)}`);
        lines.push(`DESCRIPTION:${icsEscape(`${app.position} at ${app.company}. ${ev.notes || ""}`)}`);
        lines.push("END:VEVENT");
      });
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  },

  // ---- Resume ↔ job description keyword match ---------------------------
  // A lightweight, fully offline keyword-overlap scorer: no APIs, no ML —
  // just tokenizing both texts and measuring how much of the job description's
  // distinctive vocabulary shows up in the resume.
  tokenize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+.#/ ]/g, " ")
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !MATCH_STOPWORDS.has(w) && !/^\d+$/.test(w));
  },

  computeMatch(resumeText, jdText) {
    const jdTokens = this.tokenize(jdText);
    const resumeTokens = new Set(this.tokenize(resumeText));

    if (!jdTokens.length || !resumeTokens.size) {
      return { score: 0, present: [], missing: [], keywordCount: 0, matchedCount: 0, computedAt: new Date().toISOString() };
    }

    const freq = {};
    jdTokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const topKeywords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 30);

    const present = topKeywords.filter(w => resumeTokens.has(w));
    const missing = topKeywords.filter(w => !resumeTokens.has(w));
    const ratio = present.length / topKeywords.length;

    let score;
    if (ratio >= 0.8) score = 5;
    else if (ratio >= 0.6) score = 4;
    else if (ratio >= 0.4) score = 3;
    else if (ratio >= 0.2) score = 2;
    else score = 1;

    return {
      score,
      ratio: Math.round(ratio * 100),
      present: present.slice(0, 12),
      missing: missing.slice(0, 12),
      keywordCount: topKeywords.length,
      matchedCount: present.length,
      computedAt: new Date().toISOString(),
    };
  },

  // ---- Smart insights ------------------------------------------------------
  // Every insight here is computed from the person's own stored data (tags,
  // timeline, tasks) — nothing is a canned industry statistic, since this app
  // has no server and no access to anyone else's data. Patterns that need a
  // reasonable sample size are withheld until there's enough data to say
  // something meaningful.
  generateInsights(apps) {
    const insights = [];
    const today = todayISO();
    const MIN_GROUP = 3; // minimum applications in a group before we'll compare it

    // 1) Stale applications — no movement in longer than your own average response time
    const avgResp = this.average(
      apps.filter(a => !["wishlist", "preparing"].includes(a.status))
        .map(a => this.daysToResponse(a)).filter(v => v != null)
    );
    const typicalWait = avgResp != null ? Math.round(avgResp) : 8;
    apps.forEach(a => {
      if (!["applied", "assessment"].includes(a.status) || !a.dateApplied) return;
      const waited = daysBetween(a.dateApplied, today);
      if (waited > typicalWait + 2) {
        insights.push({
          kind: "followup",
          text: `${a.company || "This application"} hasn't moved in ${waited} days — you typically hear back in ${typicalWait}. Consider a follow-up.`,
          appId: a.id,
        });
      }
    });

    // 2) Day-of-week submission pattern (only if enough spread across days)
    const byDow = {};
    apps.forEach(a => {
      if (!a.dateApplied) return;
      const dow = new Date(a.dateApplied + "T00:00:00").getDay();
      (byDow[dow] ||= []).push(a);
    });
    const dowEntries = Object.entries(byDow).filter(([, list]) => list.length >= MIN_GROUP);
    if (dowEntries.length >= 2) {
      const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const rates = dowEntries.map(([dow, list]) => ({
        dow: Number(dow),
        rate: list.filter(a => this.hasResponse(a)).length / list.length,
        n: list.length,
      })).sort((a, b) => b.rate - a.rate);
      const best = rates[0];
      const overall = apps.filter(a => a.dateApplied).length
        ? apps.filter(a => this.hasResponse(a)).length / apps.filter(a => a.dateApplied).length
        : 0;
      if (best.rate > overall + 0.1) {
        const lift = overall > 0 ? Math.round(((best.rate - overall) / overall) * 100) : Math.round(best.rate * 100);
        insights.push({
          kind: "pattern",
          text: `Applications sent on ${dowNames[best.dow]} get a response ${lift}% more often than your overall average (based on ${best.n} applications).`,
        });
      }
    }

    // 3) Tag-based performance comparison (works for "referral", industry tags, etc.
    //    — whatever the person actually tags their applications with)
    const tagGroups = {};
    apps.forEach(a => (a.tags || []).forEach(t => (tagGroups[t] ||= []).push(a)));
    const overallRespRate = apps.length ? apps.filter(a => this.hasResponse(a)).length / apps.length : 0;
    const overallInterviewRate = apps.length ? apps.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / apps.length : 0;
    Object.entries(tagGroups).forEach(([tag, list]) => {
      if (list.length < MIN_GROUP) return;
      const interviewRate = list.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / list.length;
      if (overallInterviewRate > 0 && interviewRate > overallInterviewRate * 1.5) {
        const multiplier = Math.round((interviewRate / overallInterviewRate) * 10) / 10;
        insights.push({
          kind: "pattern",
          text: `Applications tagged "${tag}" have a ${multiplier}× higher interview rate than your average (${list.length} applications).`,
        });
      }
      const respRate = list.filter(a => this.hasResponse(a)).length / list.length;
      const groupAvgResp = this.average(list.map(a => this.daysToResponse(a)).filter(v => v != null));
      if (groupAvgResp != null && avgResp != null && groupAvgResp < avgResp * 0.75 && list.length >= MIN_GROUP) {
        insights.push({
          kind: "pattern",
          text: `"${tag}"-tagged applications hear back in ~${Math.round(groupAvgResp)} days on average, vs your overall ${Math.round(avgResp)} days.`,
        });
      }
    });

    // 4) Not enough data yet — say so plainly instead of guessing
    if (!insights.length) {
      if (apps.length < MIN_GROUP) {
        insights.push({ kind: "info", text: "Log a few more applications and tag them (e.g. \"referral\", industry, source) to start unlocking personalized patterns here." });
      } else {
        insights.push({ kind: "info", text: "No strong patterns yet — insights sharpen as you log more applications, tags, and timeline events." });
      }
    }

    return insights;
  },
};

function icsEscape(str) {
  return String(str).replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
}
