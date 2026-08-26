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

// Normally filtered out for being too short to be meaningful — except these,
// which are real, common STEM/engineering acronyms and shouldn't be dropped.
const MATCH_SHORT_ALLOW = new Set([
  "ee","me","ce","ai","ml","ui","ux","qa","qc","pe","fe","3d","5s","r&d","qms","ppe",
]);

// Paragraphs opening with something like these headers get their terms
// weighted much more heavily by the resume/JD matcher — this is usually
// where the actual hard requirements live, as opposed to "About Us" filler.
const MATCH_SECTION_HEADERS = /(requirements|qualifications|must have|required skills|what you.?ll need|minimum qualifications|you have|who you are)/i;

// Common abbreviation ↔ full-term equivalences. Applied to every extracted
// term before matching, so "FEA" in a job description and "finite element
// analysis" written out in a resume are recognized as the same requirement
// instead of being scored as two unrelated, unmatched terms.
const MATCH_SYNONYMS = {
  "fea": "finite element analysis",
  "cad": "computer aided design",
  "cam": "computer aided manufacturing",
  "gdt": "geometric dimensioning and tolerancing",
  "gd&t": "geometric dimensioning and tolerancing",
  "plc": "programmable logic controller",
  "ndt": "non destructive testing",
  "spc": "statistical process control",
  "cnc": "computer numerical control",
  "hvac": "heating ventilation and air conditioning",
  "pcb": "printed circuit board",
  "dfm": "design for manufacturability",
  "dfma": "design for manufacturing and assembly",
  "bom": "bill of materials",
  "rccm": "root cause corrective action",
  "rca": "root cause analysis",
  "capa": "corrective and preventive action",
  "ppap": "production part approval process",
  "apqp": "advanced product quality planning",
  "vsm": "value stream mapping",
  "doe": "design of experiments",
  "ee": "electrical engineering",
  "me": "mechanical engineering",
  "ce": "civil engineering",
  "che": "chemical engineering",
  "ie": "industrial engineering",
  "ml": "machine learning",
  "ai": "artificial intelligence",
  "js": "javascript",
  "ui": "user interface",
  "ux": "user experience",
  "qa": "quality assurance",
  "qc": "quality control",
  "pm": "project management",
  "ros": "robot operating system",
  "iot": "internet of things",
  "plm": "product lifecycle management",
  "erp": "enterprise resource planning",
  "mrp": "material requirements planning",
};

// Known skill/tool/method terms across the major engineering & STEM
// disciplines. Present in the job description, these get extra weight since
// they're far more likely to be genuine requirements than incidental
// frequently-repeated words. Not exhaustive — the point is to bias the
// matcher toward real signal, not to be a complete taxonomy.
const MATCH_SKILL_DICTIONARY = new Set([
  // CAD / CAE / PLM tools
  "solidworks","autocad","catia","ansys","matlab","simulink","abaqus","creo","nx","fusion 360",
  "inventor","revit","staad","sap2000","altium","kicad","eagle","labview","minitab","plm",
  // mechanical / manufacturing / quality
  "gd&t","gdt","geometric dimensioning and tolerancing","six sigma","lean manufacturing",
  "fea","finite element analysis","cad","computer aided design","cam","computer aided manufacturing",
  "cnc","computer numerical control","3d printing","additive manufacturing","injection molding",
  "tolerance stack","dfm","design for manufacturability","dfma","design for manufacturing and assembly",
  "quality control","quality assurance","iso 9001","iso 9001:2015","as9100","root cause analysis",
  "root cause corrective action","corrective and preventive action","failure analysis",
  "reliability engineering","non destructive testing","ndt","statistical process control","spc",
  "production part approval process","ppap","advanced product quality planning","apqp",
  "value stream mapping","design of experiments","bill of materials","bom","kaizen","poka-yoke",
  "5s","fmea","failure mode and effects analysis","weld","welding","machining","sheet metal",
  "casting","forging","extrusion","heat treatment","metrology","first article inspection",
  // engineering sciences
  "thermodynamics","fluid dynamics","fluid mechanics","statics","dynamics","materials science",
  "heat transfer","vibration analysis","structural analysis","stress analysis","fatigue analysis",
  "control systems","signal processing","circuit design","embedded systems","firmware",
  "microcontroller","arduino","raspberry pi","pcb","printed circuit board","power electronics",
  "semiconductor","rf design","antenna design",
  // process / automation / facilities
  "hvac","plc","programmable logic controller","scada","automation","robotics","ros",
  "robot operating system","industrial automation","process engineering","p&id","hazop",
  // software / data
  "python","java","javascript","typescript","c++","c#","sql","excel","vba","power bi","tableau",
  "machine learning","artificial intelligence","data analysis","data science","tensorflow",
  "pytorch","react","node.js","git","linux","matlab","simulink",
  // project / soft skills
  "project management","agile","scrum","kanban","cross-functional","stakeholder management",
  "leadership","communication","problem solving","pmp","prince2","time management",
  "budget management","supply chain","procurement","vendor management","risk management",
  "enterprise resource planning","material requirements planning",
  // industry-specific
  "aerospace","avionics","propulsion","systems engineering","mil-std","security clearance","itar",
  "manufacturing","electrical engineering","mechanical engineering","civil engineering",
  "chemical engineering","industrial engineering","structural steel","reinforced concrete",
  "process safety","environmental compliance","internet of things","iot",
]);

// Applies MATCH_SYNONYMS so abbreviations and their spelled-out equivalents
// are treated as the same term for matching purposes.
function normalizeMatchTerm(term) {
  return MATCH_SYNONYMS[term] || term;
}

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
    companyIntel: { hq: "", size: "", interviewDifficulty: "Unknown" },
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
