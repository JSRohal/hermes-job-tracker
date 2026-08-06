/* ===========================================================
   storage.js — localStorage persistence layer (offline-first)
   =========================================================== */

const STORAGE_KEYS = {
  apps: "jat_applications_v1",
  settings: "jat_settings_v1",
};

const DEFAULT_SETTINGS = {
  theme: "dark",
  customTags: [],
  resumeVersions: [],
  coverLetterVersions: [],
};

const Store = {
  _apps: null,
  _settings: null,

  loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.apps);
      this._apps = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load applications, starting fresh.", e);
      this._apps = [];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.settings);
      this._settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      this._settings = { ...DEFAULT_SETTINGS };
    }
    this._migrateLibrary("resumeVersions");
    this._migrateLibrary("coverLetterVersions");
    return { apps: this._apps, settings: this._settings };
  },

  // Resume/cover-letter library entries used to be plain strings; they're now
  // { id, name, text } objects so a version can carry its actual document
  // text for the resume/JD match feature. Upgrade old data in place.
  _migrateLibrary(key) {
    const list = this._settings[key];
    if (!Array.isArray(list) || !list.length) return;
    let changed = false;
    this._settings[key] = list.map(item => {
      if (typeof item === "string") {
        changed = true;
        return { id: uid(), name: item, text: "" };
      }
      return item;
    });
    if (changed) this.persistSettings();
  },

  persistApps() {
    try {
      localStorage.setItem(STORAGE_KEYS.apps, JSON.stringify(this._apps));
      return true;
    } catch (e) {
      console.error("Storage write failed (quota?)", e);
      return false;
    }
  },

  persistSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(this._settings));
  },

  getApps() { return this._apps; },
  getSettings() { return this._settings; },

  upsertApp(app) {
    const idx = this._apps.findIndex(a => a.id === app.id);
    app.updatedAt = new Date().toISOString();
    if (idx >= 0) this._apps[idx] = app;
    else this._apps.push(app);
    this.persistApps();
  },

  deleteApp(id) {
    this._apps = this._apps.filter(a => a.id !== id);
    this.persistApps();
  },

  deleteApps(ids) {
    const set = new Set(ids);
    this._apps = this._apps.filter(a => !set.has(a.id));
    this.persistApps();
  },

  getApp(id) {
    return this._apps.find(a => a.id === id);
  },

  updateSettings(patch) {
    this._settings = { ...this._settings, ...patch };
    this.persistSettings();
  },

  exportJSON() {
    return JSON.stringify({ apps: this._apps, settings: this._settings, exportedAt: new Date().toISOString() }, null, 2);
  },

  importJSON(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data.apps)) throw new Error("Invalid file: missing applications array");
    this._apps = data.apps;
    if (data.settings) this._settings = { ...DEFAULT_SETTINGS, ...data.settings };
    this._migrateLibrary("resumeVersions");
    this._migrateLibrary("coverLetterVersions");
    this.persistApps();
    this.persistSettings();
  },
};
