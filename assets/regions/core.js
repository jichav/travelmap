// Shared state, language and data loading for regions.html.
// Everything hangs off window.R; R.s holds the mutable state.
window.R = window.R || {};
(function (R) {
  "use strict";

  R.CFG = window.CONFIG;
  R.SRC = window.REGION_SOURCE;
  R.CZR = window.CZ_REGIONS;
  R.DNAMES = window.CZ_DISTRICT_NAMES;

  R.$ = id => document.getElementById(id);
  R.LS_DATA = "travelmap.regions.v1";
  R.LS_TOKEN = "travelmap.token.v1";
  R.LS_LANG = "travelmap.lang.v1";
  R.LS_COUNTRY = "travelmap.regions.country.v1";
  R.SS_SESSION = "travelmap.session.v1";
  R.DATA_PATH = "data/regions.json";

  const $ = R.$;

  const s = R.s = {
    lang: localStorage.getItem(R.LS_LANG) === "cs" ? "cs" : "en",
    country: window.REGION_COUNTRIES.some(c => c.id === localStorage.getItem(R.LS_COUNTRY))
      ? localStorage.getItem(R.LS_COUNTRY) : "CZ",
    data: { updated: null, places: {} },
    world: null,        // surrounding countries, for context
    regions: [],        // kraje
    topo: null,         // shared topology, for boundary lines
    districts: [],      // okresy
    seatShown: 0,       // seat dots on the current map, for the legend
    level: "regions",
    focus: null,        // kraj id the map is zoomed to, or null for the whole country
    selected: null,
    editing: false,
    dirty: false,
    fetchError: null,
    mapError: null
  };

  R.t = function (k, vars) {
    let str = window.I18N_REG[s.lang][k];
    if (str == null) str = window.I18N[s.lang][k];
    if (str == null) return "";
    if (vars) Object.keys(vars).forEach(v => { str = str.split("{" + v + "}").join(vars[v]); });
    return str;
  };
  const t = R.t;

  R.country = id => window.REGION_COUNTRIES.find(c => c.id === (id || s.country))
    || window.REGION_COUNTRIES[0];
  R.countryName = c => s.lang === "cs" ? c.nameCs : c.name;

  R.setCountry = function (id) {
    if (id === s.country) return;
    s.country = id;
    localStorage.setItem(R.LS_COUNTRY, id);
    s.focus = null;
    s.selected = null;
    s.regions = [];
    s.districts = [];
    s.topo = null;
    s.mapError = null;
    R.render();
    R.loadCountry(id).then(R.render).catch(() => { s.mapError = true; R.render(); });
  };

  R.nameOf = u => s.lang === "cs" ? u.nameCs : u.name;
  R.byName = (p, q) => R.nameOf(p).localeCompare(R.nameOf(q), s.lang === "cs" ? "cs" : "en");
  R.units = () => s.level === "regions" ? s.regions : s.districts;
  R.byId = id => s.regions.concat(s.districts).find(u => u.id === id) || null;
  R.regionOf = id => s.regions.find(r => r.id === id) || null;
  R.isVisited = id => Object.prototype.hasOwnProperty.call(s.data.places, id);
  R.rec = id => s.data.places[id];
  R.inFocus = u => !s.focus || u.id === s.focus || u.parent === s.focus;

  R.applyStatic = function () {
    document.documentElement.lang = s.lang;
    document.title = t("docTitle");
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", t("metaDesc"));
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-reg]").forEach(el => { el.textContent = t(el.dataset.i18nReg); });
    document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-reg-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nRegHtml); });
    document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const v = t(el.dataset.i18nAttr);
      el.setAttribute("aria-label", v);
      if (el.hasAttribute("title")) el.setAttribute("title", v);
    });
    document.querySelectorAll(".lang").forEach(b => b.classList.toggle("on", b.dataset.lang === s.lang));
    R.sessionChrome();
    R.bindExport();
  };

  R.setLang = function (next) {
    if (next === s.lang) return;
    s.lang = next;
    localStorage.setItem(R.LS_LANG, s.lang);
    $("countryTabs").innerHTML = "";
    R.applyStatic();
    R.render();
  };

  R.persistLocal = () => { try { localStorage.setItem(R.LS_DATA, JSON.stringify(s.data)); } catch (e) {} };

  R.touch = function () {
    s.data.updated = new Date().toISOString();
    s.dirty = true;
    R.persistLocal();
    R.render();
  };

  R.load = async function () {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(R.LS_DATA) || "null"); } catch (e) {}
    if (local && local.places) { s.data = local; R.render(); }

    let remote = null, err = null;
    try {
      const r = await fetch(R.DATA_PATH, { cache: "no-store" });
      if (r.ok) remote = await r.json();
      else err = "Could not read " + R.DATA_PATH + " (" + r.status + ").";
    } catch (e) { err = "Could not reach " + R.DATA_PATH + "."; }

    if (remote && remote.places) {
      const rt = Date.parse(remote.updated || 0) || 0;
      const lt = local ? (Date.parse(local.updated || 0) || 0) : -1;
      if (rt >= lt) { s.data = remote; R.persistLocal(); s.dirty = false; }
      else { s.dirty = true; }
    }
    s.fetchError = err;
    R.render();
  };

  R.syncState = function () {
    const el = $("syncState");
    const when = s.data.updated
      ? new Date(s.data.updated).toLocaleDateString(s.lang === "cs" ? "cs-CZ" : "en-GB",
          { year: "numeric", month: "short", day: "numeric" })
      : "\u2013";
    $("stamp").textContent = t("lastChange", { when: when });
    if (!el) return;
    if (s.fetchError) { el.textContent = s.fetchError + " " + t("localCopy"); return; }
    if (!s.editing) { el.textContent = t("lastChangeDot", { when: when }); return; }
    el.textContent = s.dirty ? t("unsaved") : t("inSync");
  };
})(window.R);
