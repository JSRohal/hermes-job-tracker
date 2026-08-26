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
  // Fully offline — no APIs, no ML model download. Extracts phrases (bigrams
  // and trigrams) as well as single words, since real requirements are
  // usually multi-word terms ("finite element analysis" ≠ "finite" +
  // "element" + "analysis"). Normalizes common abbreviations to their full
  // form (MATCH_SYNONYMS) so "FEA" in a job posting matches "finite element
  // analysis" spelled out on a resume. Weighs terms found near a
  // "Requirements/Qualifications"-style heading much more than incidental
  // text, and gives known skill/tool terms from a curated STEM/engineering
  // dictionary extra weight since they're far more likely to be genuine
  // requirements than frequency alone would suggest.
  // Lowercases + strips punctuation but does NOT drop stopwords — needed so
  // n-gram building below can still see connector words like "and"/"of" in
  // their original position (see tokenize() for why that matters).
  tokenizeRaw(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+.#/&\- ]/g, " ")
      .split(/\s+/)
      .map(w => w.trim().replace(/^[.\-]+|[.\-]+$/g, "")) // strip stray leading/trailing sentence punctuation (keeps "node.js", "c++", "c#" intact — only edge chars are trimmed)
      .filter(w => w && !/^\d+$/.test(w));
  },

  isMatchStopword(w) {
    return MATCH_STOPWORDS.has(w) || (w.length <= 2 && !MATCH_SHORT_ALLOW.has(w));
  },

  // Unigrams only — filters out stopwords/too-short words entirely, since a
  // lone filler word is never meaningful on its own.
  tokenize(text) {
    return this.tokenizeRaw(text).filter(w => !this.isMatchStopword(w));
  },

  // Splits a chunk of text into sentence/list-item-like fragments so n-grams
  // never bridge two unrelated clauses or comma-separated list items (e.g.
  // "...Six Sigma. CNC machining..." must never produce "sigma cnc
  // machining", and "Python, Java, SQL" must never produce "python java").
  // Splits on ". " / "; " / ", " / newlines / bullets, but NOT bare periods
  // with no following space, so compound terms like "node.js" survive intact.
  splitSentences(text) {
    return (text || "").split(/(?:\.\s+|[;,]\s*|\n+|•)/).map(s => s.trim()).filter(Boolean);
  },

  // Real multi-word technical terms often have a connector word in the
  // middle ("dimensioning AND tolerancing", "design OF experiments",
  // "design FOR manufacturability") — those must NOT be built from the
  // stopword-filtered word list (tokenize()), which would drop "and"/"of"/
  // "for" and glue together the wrong neighboring words instead. Building
  // n-grams from the raw, unfiltered sequence and only requiring the FIRST
  // and LAST word to be meaningful (interior connector words are fine)
  // reconstructs these phrases correctly.
  addNgrams(rawWords, add, weight) {
    for (let i = 0; i < rawWords.length - 1; i++) {
      const a = rawWords[i], b = rawWords[i + 1];
      if (!this.isMatchStopword(a) && !this.isMatchStopword(b)) add(`${a} ${b}`, weight * 1.6);
    }
    for (let i = 0; i < rawWords.length - 2; i++) {
      const a = rawWords[i], b = rawWords[i + 1], c = rawWords[i + 2];
      if (!this.isMatchStopword(a) && !this.isMatchStopword(c)) add(`${a} ${b} ${c}`, weight * 2.1);
    }
  },

  // Returns { term: weight } for every unigram/bigram/trigram in the text,
  // with abbreviations normalized to their canonical full form.
  extractWeightedTerms(text) {
    const paragraphs = (text || "").split(/\n+/).filter(Boolean);
    const source = paragraphs.length > 1 ? paragraphs : [(text || "")];
    const weights = {};
    const add = (term, weight) => {
      const norm = normalizeMatchTerm(term);
      if (!norm || MATCH_STOPWORDS.has(norm)) return;
      weights[norm] = (weights[norm] || 0) + weight;
    };

    source.forEach(section => {
      const boosted = MATCH_SECTION_HEADERS.test(section.slice(0, 80));
      const sectionWeight = boosted ? 2.5 : 1;
      this.splitSentences(section).forEach(sentence => {
        const rawWords = this.tokenizeRaw(sentence);
        rawWords.filter(w => !this.isMatchStopword(w)).forEach(w => add(w, sectionWeight));
        this.addNgrams(rawWords, add, sectionWeight);
      });
    });

    Object.keys(weights).forEach(term => {
      if (MATCH_SKILL_DICTIONARY.has(term)) weights[term] *= 3;
    });
    return weights;
  },

  // Builds the same unigram/bigram/trigram + synonym-normalized term set for
  // a resume (also sentence-aware), so it can be checked against the job
  // description's weighted terms on equal footing. Also tracks the plain
  // unigram set separately, since some synonym-expanded canonical terms
  // (e.g. "GD&T" → "geometric dimensioning and tolerancing", 4 words) are
  // longer than the trigrams we build — hasTerm() below falls back to a
  // bag-of-words check for those rather than requiring exact adjacency.
  extractResumeTerms(text) {
    const terms = new Set();
    const unigrams = new Set();
    const add = term => { const norm = normalizeMatchTerm(term); if (norm) terms.add(norm); };
    this.splitSentences(text).forEach(sentence => {
      const rawWords = this.tokenizeRaw(sentence);
      rawWords.filter(w => !this.isMatchStopword(w)).forEach(w => { add(w); unigrams.add(w); });
      this.addNgrams(rawWords, add, 1);
    });
    return { terms, unigrams };
  },

  // Exact match first; for long (3+ significant word) canonical phrases —
  // which mostly come from synonym expansion — falls back to checking that
  // every significant word appears somewhere in the resume, since requiring
  // perfect contiguous phrasing for a spelled-out abbreviation is too strict.
  hasTerm(resumeTerms, term) {
    if (resumeTerms.terms.has(term)) return true;
    const words = term.split(" ").filter(w => !this.isMatchStopword(w));
    if (words.length >= 3) return words.every(w => resumeTerms.unigrams.has(w));
    return false;
  },

  // Drops shorter phrases that are wholly contained in a longer one already
  // in the list (e.g. "process", "control", "process control" all present
  // alongside "statistical process control" is just noisy repetition of the
  // same signal) — keeps the display concise and informative rather than
  // cluttered with every overlapping sub-phrase.
  declutterTerms(terms) {
    const byLength = terms.slice().sort((a, b) => b.length - a.length);
    const kept = [];
    byLength.forEach(t => {
      if (!kept.some(k => k.includes(t))) kept.push(t);
    });
    return terms.filter(t => kept.includes(t));
  },

  computeMatch(resumeText, jdText) {
    const jdWeights = this.extractWeightedTerms(jdText);
    const resumeTerms = this.extractResumeTerms(resumeText);

    const ranked = Object.entries(jdWeights).sort((a, b) => b[1] - a[1]).slice(0, 50);
    if (!ranked.length || !resumeTerms.terms.size) {
      return { score: 0, ratio: 0, present: [], missing: [], source: "local", computedAt: new Date().toISOString() };
    }

    const totalWeight = ranked.reduce((s, [, w]) => s + w, 0);
    let matchedWeight = 0;
    const present = [], missing = [];
    ranked.forEach(([term, weight]) => {
      if (this.hasTerm(resumeTerms, term)) { matchedWeight += weight; present.push(term); }
      else missing.push(term);
    });

    const ratio = matchedWeight / totalWeight;
    let score;
    if (ratio >= 0.75) score = 5;
    else if (ratio >= 0.55) score = 4;
    else if (ratio >= 0.38) score = 3;
    else if (ratio >= 0.2) score = 2;
    else score = 1;

    return {
      score,
      ratio: Math.round(ratio * 100),
      present: this.declutterTerms(present).slice(0, 12),
      missing: this.declutterTerms(missing).slice(0, 12),
      source: "local",
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

    // 4) Checklist completion vs interview rate
    const withChecklist = apps.filter(a => a.checklist && CHECKLIST_ITEMS.every(c => c.key in a.checklist));
    const fullyChecked = withChecklist.filter(a => CHECKLIST_ITEMS.every(c => a.checklist[c.key]));
    const notFullyChecked = withChecklist.filter(a => !CHECKLIST_ITEMS.every(c => a.checklist[c.key]));
    if (fullyChecked.length >= MIN_GROUP && notFullyChecked.length >= MIN_GROUP) {
      const rateChecked = fullyChecked.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / fullyChecked.length;
      const rateUnchecked = notFullyChecked.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / notFullyChecked.length;
      if (rateChecked > rateUnchecked + 0.1) {
        insights.push({
          kind: "pattern",
          text: `Applications where you completed the full checklist (resume tailored, cover letter, forms, follow-up) get interviews ${Math.round((rateChecked - rateUnchecked) * 100)} percentage points more often than incomplete ones.`,
        });
      }
    }

    // 5) Resume/JD match score vs interview rate (uses the "Analyze match" feature)
    const scored = apps.filter(a => a.matchInfo && typeof a.matchInfo.score === "number");
    const highMatch = scored.filter(a => a.matchInfo.score >= 4);
    const lowMatch = scored.filter(a => a.matchInfo.score < 4);
    if (highMatch.length >= MIN_GROUP && lowMatch.length >= MIN_GROUP) {
      const rateHigh = highMatch.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / highMatch.length;
      const rateLow = lowMatch.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / lowMatch.length;
      if (rateHigh > rateLow + 0.1) {
        insights.push({
          kind: "pattern",
          text: `Applications with a 4–5 star resume match score land interviews ${Math.round((rateHigh - rateLow) * 100)} percentage points more often than lower-scored ones — worth tailoring your resume before applying.`,
        });
      }
    }

    // 6) Your own fit rating vs actual outcome — checks whether your gut feel tracks results
    const highFit = apps.filter(a => (a.rating || 0) >= 4);
    const lowFit = apps.filter(a => (a.rating || 0) > 0 && a.rating < 4);
    if (highFit.length >= MIN_GROUP && lowFit.length >= MIN_GROUP) {
      const rateHighFit = highFit.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / highFit.length;
      const rateLowFit = lowFit.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / lowFit.length;
      if (rateHighFit > rateLowFit + 0.1) {
        insights.push({
          kind: "pattern",
          text: `Applications you rated 4–5 stars for fit actually do get more interviews (${Math.round(rateHighFit * 100)}% vs ${Math.round(rateLowFit * 100)}%) — your fit rating is a good signal, trust it when prioritizing where to apply.`,
        });
      }
    }

    // 7) Application pace vs your own historical average
    const datedApps = apps.filter(a => a.dateApplied).sort((a, b) => a.dateApplied.localeCompare(b.dateApplied));
    if (datedApps.length >= MIN_GROUP * 2) {
      const firstDate = new Date(datedApps[0].dateApplied + "T00:00:00");
      const weeksSpanned = Math.max(1, Math.round(daysBetween(datedApps[0].dateApplied, today) / 7));
      const overallPerWeek = datedApps.length / weeksSpanned;
      const thisWeekCount = this.applicationsThisWeek(apps);
      if (overallPerWeek >= 1 && thisWeekCount < overallPerWeek * 0.5) {
        insights.push({
          kind: "info",
          text: `You've applied to ${thisWeekCount} job${thisWeekCount === 1 ? "" : "s"} this week, below your average pace of ~${Math.round(overallPerWeek * 10) / 10}/week — worth blocking time to catch up if the search is still active.`,
        });
      }
    }

    // 8) High ghost rate among closed applications
    const closedApps = apps.filter(a => CLOSED_STATUSES.includes(a.status));
    if (closedApps.length >= MIN_GROUP) {
      const ghostRate = closedApps.filter(a => a.status === "ghosted").length / closedApps.length;
      if (ghostRate >= 0.4) {
        insights.push({
          kind: "info",
          text: `${Math.round(ghostRate * 100)}% of your closed applications ended in silence rather than a formal rejection — a brief follow-up email around your typical ${typicalWait}-day response window may surface more explicit answers.`,
        });
      }
    }

    // 9) Resume version performance comparison — which version actually gets interviews
    const resumeGroups = {};
    apps.forEach(a => { if (a.resumeVersion) (resumeGroups[a.resumeVersion] ||= []).push(a); });
    const resumeEntries = Object.entries(resumeGroups).filter(([, list]) => list.length >= MIN_GROUP);
    if (resumeEntries.length >= 2) {
      const rates = resumeEntries.map(([name, list]) => ({
        name, n: list.length,
        rate: list.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / list.length,
      })).sort((a, b) => b.rate - a.rate);
      const best = rates[0], worst = rates[rates.length - 1];
      if (best.name !== worst.name && best.rate > worst.rate + 0.15) {
        insights.push({
          kind: "pattern",
          text: `Resume version "${best.name}" lands interviews ${Math.round((best.rate - worst.rate) * 100)} percentage points more often than "${worst.name}" (${best.n} vs ${worst.n} applications) — worth using it more.`,
        });
      }
    }

    // 10) Cover letter version performance comparison
    const coverGroups = {};
    apps.forEach(a => { if (a.coverLetterVersion) (coverGroups[a.coverLetterVersion] ||= []).push(a); });
    const coverEntries = Object.entries(coverGroups).filter(([, list]) => list.length >= MIN_GROUP);
    if (coverEntries.length >= 2) {
      const rates = coverEntries.map(([name, list]) => ({
        name, n: list.length,
        rate: list.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES)).length / list.length,
      })).sort((a, b) => b.rate - a.rate);
      const best = rates[0], worst = rates[rates.length - 1];
      if (best.name !== worst.name && best.rate > worst.rate + 0.15) {
        insights.push({
          kind: "pattern",
          text: `Cover letter version "${best.name}" lands interviews ${Math.round((best.rate - worst.rate) * 100)} percentage points more often than "${worst.name}" — worth using it more.`,
        });
      }
    }

    // 11) Rejection stage clustering — where in the pipeline do things usually end?
    const rejectedApps = apps.filter(a => a.status === "rejected");
    if (rejectedApps.length >= MIN_GROUP) {
      const dropOffCounts = {};
      rejectedApps.forEach(a => {
        const reached = (a.timeline || []).filter(t => t.statusKey && !CLOSED_STATUSES.includes(t.statusKey));
        if (!reached.length) return;
        const furthest = reached.reduce((max, t) => STATUS_MAP[t.statusKey].order > STATUS_MAP[max.statusKey].order ? t : max);
        dropOffCounts[furthest.statusKey] = (dropOffCounts[furthest.statusKey] || 0) + 1;
      });
      const ranked = Object.entries(dropOffCounts).sort((a, b) => b[1] - a[1]);
      if (ranked.length) {
        const [stageKey, count] = ranked[0];
        const share = count / rejectedApps.length;
        if (count >= MIN_GROUP && share >= 0.4) {
          insights.push({
            kind: "pattern",
            text: `${Math.round(share * 100)}% of your rejections happen right after ${STATUS_MAP[stageKey].label} — that stage is likely where extra prep would pay off most.`,
          });
        }
      }
    }

    // 12) Interview → offer conversion rate — useful context even without a comparison group
    const interviewedApps = apps.filter(a => this.hasReachedAny(a, INTERVIEW_STATUSES));
    if (interviewedApps.length >= MIN_GROUP) {
      const offered = interviewedApps.filter(a => this.hasReachedAny(a, OUTCOME_POSITIVE)).length;
      const rate = Math.round((offered / interviewedApps.length) * 100);
      insights.push({
        kind: "info",
        text: `You've converted ${rate}% of interviews into offers so far (${offered} of ${interviewedApps.length}) — useful context for how many interviews you may need for your next offer.`,
      });
    }

    // 13) Favorited companies with no recent activity
    const favorites = apps.filter(a => a.favorite);
    if (favorites.length) {
      const stale = favorites.filter(a => {
        const dates = (a.timeline || []).map(t => t.date).filter(Boolean);
        const lastActivity = dates.length ? dates.sort().slice(-1)[0] : (a.createdAt || "").slice(0, 10);
        return !lastActivity || daysBetween(lastActivity, today) > 21;
      });
      if (stale.length) {
        const names = stale.map(a => a.company).filter(Boolean).slice(0, 3).join(", ");
        insights.push({
          kind: "info",
          text: `${stale.length} favorited compan${stale.length === 1 ? "y hasn't" : "ies haven't"} seen any activity in 3+ weeks${names ? ` (${names}${stale.length > 3 ? ", …" : ""})` : ""} — worth a status check or a fresh application.`,
        });
      }
    }

    // 14) Not enough data yet — say so plainly instead of guessing
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
