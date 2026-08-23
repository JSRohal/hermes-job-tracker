/* ===========================================================
   data.js — static configuration & constants
   =========================================================== */

// Ordered status pipeline. Order encodes real progression through
// a job search, used for the track visualization and sorting.
const STATUS_PIPELINE = [
  { key: "wishlist",   label: "Wishlist",            color: "#64748b", group: "early" },
  { key: "preparing",  label: "Preparing",           color: "#8b5cf6", group: "early" },
  { key: "applied",    label: "Applied",             color: "#3b82f6", group: "active" },
  { key: "assessment", label: "Assessment",          color: "#06b6d4", group: "active" },
  { key: "phone",      label: "Phone Screen",        color: "#14b8a6", group: "active" },
  { key: "technical",  label: "Technical Interview", color: "#22c55e", group: "active" },
  { key: "onsite",     label: "On-site",             color: "#84cc16", group: "active" },
  { key: "final",      label: "Final Interview",     color: "#eab308", group: "active" },
  { key: "offer",      label: "Offer",               color: "#f97316", group: "outcome" },
  { key: "accepted",   label: "Accepted",            color: "#10b981", group: "outcome" },
  { key: "rejected",   label: "Rejected",            color: "#ef4444", group: "closed" },
  { key: "withdrawn",  label: "Withdrawn",           color: "#94a3b8", group: "closed" },
  { key: "ghosted",    label: "Ghosted",             color: "#a855f7", group: "closed" },
];

const STATUS_MAP = Object.fromEntries(STATUS_PIPELINE.map((s, i) => [s.key, { ...s, order: i }]));

const INTERVIEW_STATUSES = ["phone", "technical", "onsite", "final"];
const CLOSED_STATUSES = ["rejected", "withdrawn", "ghosted"];
const OUTCOME_POSITIVE = ["offer", "accepted"];

const DEFAULT_TAGS = [
  "remote", "hybrid", "onsite", "mechanical", "aerospace", "defense",
  "dream company", "entry level", "internship", "senior", "startup", "faang"
];

const CHECKLIST_ITEMS = [
  { key: "resumeTailored",  label: "Resume tailored" },
  { key: "coverLetter",     label: "Cover letter written" },
  { key: "formsCompleted",  label: "Online forms completed" },
  { key: "followUp",        label: "Follow-up sent" },
];

const DOCUMENT_TYPES = ["Resume", "Cover Letter", "Portfolio", "Reference List", "Other"];

const SALARY_PERIODS = ["year", "hour"];

const INTERVIEW_DIFFICULTY_LEVELS = ["Unknown", "Easy", "Medium", "Hard", "Very Hard"];

// A curated stoplist used by the resume/JD keyword matcher — common English
// filler words that carry no signal about role requirements.
const MATCH_STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","as","is","are","was","were",
  "be","been","being","this","that","these","those","it","its","at","by","from","we","you","our",
  "your","will","shall","can","may","must","have","has","had","not","no","if","than","then","so",
  "such","into","about","across","per","etc","including","include","includes","all","any","each",
  "other","more","most","some","also","up","out","over","under","after","before","between","while",
  "them","they","he","she","his","her","their","who","which","what","when","where","how","why",
  "job","role","position","company","team","work","working","experience","years","year","strong",
  "ability","skills","skill","required","requirements","preferred","plus","etc.","us"
]);

// Paragraphs opening with something like these headers get their terms
// weighted much more heavily by the resume/JD matcher — this is usually
// where the actual hard requirements live, as opposed to "About Us" filler.
const MATCH_SECTION_HEADERS = /(requirements|qualifications|must have|required skills|what you.?ll need|minimum qualifications|you have|who you are)/i;

// Known skill/tool/method terms. Present in the job description, these get
// extra weight since they're far more likely to be genuine requirements
// than incidental frequently-repeated words. Not exhaustive — the point is
// to bias the matcher toward real signal, not to be a complete taxonomy.
const MATCH_SKILL_DICTIONARY = new Set([
  "solidworks","autocad","catia","ansys","matlab","simulink","abaqus","creo","nx","fusion 360",
  "gd&t","gdt","six sigma","lean manufacturing","fea","finite element analysis","cad","cam","cnc",
  "3d printing","additive manufacturing","injection molding","tolerance stack","dfm","dfma",
  "quality control","iso 9001","root cause analysis","failure analysis","reliability engineering",
  "thermodynamics","fluid dynamics","statics","dynamics","materials science","hvac","plc",
  "python","java","javascript","typescript","c++","c#","sql","excel","vba","power bi","tableau",
  "machine learning","data analysis","data science","tensorflow","pytorch","react","node.js",
  "project management","agile","scrum","kanban","cross-functional","stakeholder management",
  "leadership","communication","problem solving","pmp","prince2","time management",
  "aerospace","avionics","propulsion","structural analysis","systems engineering","mil-std",
  "security clearance","itar","budget management","supply chain","procurement","vendor management",
  "risk management","manufacturing","automation","robotics","electrical engineering",
  "mechanical engineering","civil engineering","chemical engineering",
]);

function uid() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.round((d2 - d1) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function emptyApplication(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    company: "",
    position: "",
    location: "",
    status: "wishlist",
    dateApplied: "",
    jobUrl: "",
    notes: "",
    resumeVersion: "",
    coverLetterVersion: "",
    tags: [],
    rating: 0,
    favorite: false,
    salary: { min: "", max: "", currency: "USD", period: "year" },
    jobDescription: "",
    checklist: Object.fromEntries(CHECKLIST_ITEMS.map(c => [c.key, false])),
    timeline: [],
    companyIntel: { hq: "", glassdoorRating: "", size: "", interviewDifficulty: "Unknown" },
    interviewNotes: [],
    contacts: [],
    documents: [],
    tasks: [],
    matchInfo: null, // { score, missing: [], present: [], computedAt } — set by "Analyze match"
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
