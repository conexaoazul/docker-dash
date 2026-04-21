/* ═══════════════════════════════════════════════════
   i18n.js — Internationalization Engine

   Translations are in separate files: /js/i18n/{code}.js
   Each file calls i18n.register(code, label, name, translations)

   To add a new language:
   1. Copy /js/i18n/en.js to /js/i18n/{code}.js
   2. Translate all values (keep keys in English)
   3. Change the register() call: i18n.register('{code}', '{CODE}', '{Native Name}', { ... })
   4. Add <script src="/js/i18n/{code}.js"> in index.html (before i18n.js is NOT required, after is fine)
   5. That's it — the language appears automatically in the selector

   See CONTRIBUTING.md for full instructions.
   ═══════════════════════════════════════════════════ */
'use strict';

const i18n = {
  _lang: 'en',
  _fallback: 'en',
  _translations: {},
  _languages: [], // { code, label, name }

  /** Register a language. Called by each /js/i18n/{code}.js file. */
  register(code, label, name, translations) {
    this._translations[code] = translations;
    // Avoid duplicates
    if (!this._languages.find(l => l.code === code)) {
      this._languages.push({ code, label, name });
    }
  },

  init() {
    const saved = localStorage.getItem('dd-lang');
    if (saved && this._translations[saved]) this._lang = saved;
    document.documentElement.lang = this._lang;
  },

  // v6.11.1: Load runtime overrides from DB (accepted + applied translations)
  // and deep-merge on top of the statically-registered tree. Called once after
  // auth succeeds (see app.js init). Accept in the Review panel also calls
  // reloadAllOverrides() so edits go live without a page reload.
  async loadOverrides(code) {
    if (code === 'en') return;  // EN is the source — no overrides by design
    if (!this._translations[code]) return;
    try {
      const res = await fetch(`/api/translations/overrides/${encodeURIComponent(code)}`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.overrides || typeof data.overrides !== 'object') return;
      this._deepMerge(this._translations[code], data.overrides);
    } catch { /* network error — silently keep static translations */ }
  },

  async reloadAllOverrides() {
    const langs = Object.keys(this._translations).filter(c => c !== 'en');
    await Promise.all(langs.map(c => this.loadOverrides(c)));
  },

  _deepMerge(target, source) {
    for (const [k, v] of Object.entries(source || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        this._deepMerge(target[k], v);
      } else {
        target[k] = v;
      }
    }
  },

  get lang() { return this._lang; },

  setLang(lang) {
    if (!this._translations[lang]) return;
    this._lang = lang;
    localStorage.setItem('dd-lang', lang);
    document.documentElement.lang = lang;
  },

  t(key, params) {
    let val = this._resolve(this._translations[this._lang], key);
    if (val === undefined) val = this._resolve(this._translations[this._fallback], key);
    if (val === undefined) { console.warn(`[i18n] Missing: "${key}"`); return key; }
    if (params && typeof val === 'string') {
      val = val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] !== undefined ? params[k] : `{{${k}}}`);
    }
    return val;
  },

  _resolve(obj, key) {
    if (!obj) return undefined;
    const parts = key.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  },

  /** Get all registered languages */
  get languages() {
    return this._languages;
  },

  /** Get the next language code (for cycling through languages) */
  nextLang() {
    const idx = this._languages.findIndex(l => l.code === this._lang);
    const next = this._languages[(idx + 1) % this._languages.length];
    return next?.code || 'en';
  },
};

window.i18n = i18n;
