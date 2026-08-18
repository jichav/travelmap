(function () {
  "use strict";

  const CFG = window.CONFIG;
  const LIST = window.COUNTRIES;
  const CONTS = window.CONTINENTS;
  const VIEW = window.CONTINENT_VIEW;
  const NAME_TO_ID = window.NAME_TO_ID || {};
  const SCOPES = CONTS.concat(["World"]);

  const key = s => { const v = String(s); return /^\d+$/.test(v) ? v.padStart(3, "0") : v; };
  LIST.forEach(c => { c.id = key(c.id); });
  const BY_ID = new Map(LIST.map(c => [c.id, c]));

  const LS_DATA = "travelmap.data.v1";
  const LS_TOKEN = "travelmap.token.v1";
  const SS_SESSION = "travelmap.session.v1";

  const $ = id => document.getElementById(id);

  // ── language ───────────────────────────────────────────────────────────────
  const LS_LANG = "travelmap.lang.v1";
  const I18N = window.I18N;
  const CS_NAME = window.CS_NAME || {};
  const CS_CAPITAL = window.CS_CAPITAL || {};
  let lang = localStorage.getItem(LS_LANG) === "cs" ? "cs" : "en";
  const T = () => I18N[lang];
  const t = (k, vars) => {
    let s = T()[k];
    if (s == null) return "";
    if (vars) Object.keys(vars).forEach(v => { s = s.split("{" + v + "}").join(vars[v]); });
    return s;
  };
  const contName = s => T().continents[s] || s;
  const nameOf = c => lang === "cs" ? (CS_NAME[c.id] || c.name) : c.name;
  const capOf = c => lang === "cs" ? (CS_CAPITAL[c.id] || c.capital) : c.capital;
  const byName = (p, q) => nameOf(p).localeCompare(nameOf(q), lang === "cs" ? "cs" : "en");

  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = t("docTitle");
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", t("metaDesc"));
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const v = t(el.dataset.i18nAttr);
      el.setAttribute("aria-label", v);
      if (el.hasAttribute("title")) el.setAttribute("title", v);
    });
    document.querySelectorAll(".lang").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
    sessionChrome();
    bindExport();
  }

  function setLang(next) {
    if (next === lang) return;
    lang = next;
    localStorage.setItem(LS_LANG, lang);
    applyStatic();
    render();
    syncState();
  }

  let data = { updated: null, countries: {} };
  let world = null;
  let haveGeom = new Set();
  let scope = "Europe";
  let selected = null;
  let editing = false;
  let dirty = false;
  let fetchError = null;

  function featureKey(f) {
    const raw = f.id == null ? "" : String(f.id);
    if (!/^\d+$/.test(raw)) return NAME_TO_ID[(f.properties && f.properties.name) || ""] || "";
    return key(raw);
  }

  // ── data ───────────────────────────────────────────────────────────────────
  const visitedIds = () => Object.keys(data.countries);
  const isVisited = id => Object.prototype.hasOwnProperty.call(data.countries, id);
  const rec = id => data.countries[id];
  const inScope = s => s === "World" ? LIST : LIST.filter(c => c.continent === s || c.also === s);

  function stats(s) {
    const all = inScope(s);
    const st = all.filter(c => c.kind === "state");
    const terr = all.filter(c => c.kind !== "state");
    const vSt = st.filter(c => isVisited(c.id)).length;
    const vTe = terr.filter(c => isVisited(c.id)).length;
    const caps = all.filter(c => { const r = rec(c.id); return r && r.capital; }).length;
    const capStates = st.filter(c => { const r = rec(c.id); return r && r.capital; }).length;
    return {
      states: st.length, visitedStates: vSt,
      terrs: terr.length, visitedTerrs: vTe,
      places: all.length, caps: caps, capStates: capStates,
      pct: st.length ? (vSt / st.length) * 100 : 0,
      unlocked: s === "World" || vSt + vTe > 0
    };
  }

  function normalizeKeys(d) {
    if (!d || !d.countries) return d;
    const out = {};
    Object.keys(d.countries).forEach(k => { out[key(k)] = d.countries[k]; });
    d.countries = out;
    return d;
  }

  const persistLocal = () => { try { localStorage.setItem(LS_DATA, JSON.stringify(data)); } catch (e) {} };

  function touch() {
    data.updated = new Date().toISOString();
    dirty = true;
    persistLocal();
    render();
  }

  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_DATA) || "null"); } catch (e) {}
    if (local && local.countries) { data = normalizeKeys(local); render(); }

    let remote = null, err = null;
    try {
      const r = await fetch("data/travel.json", { cache: "no-store" });
      if (r.ok) remote = await r.json();
      else err = "Could not read data/travel.json (" + r.status + ").";
    } catch (e) { err = "Could not reach data/travel.json."; }

    if (remote && remote.countries) {
      const rt = Date.parse(remote.updated || 0) || 0;
      const lt = local ? (Date.parse(local.updated || 0) || 0) : -1;
      if (rt >= lt) { data = normalizeKeys(remote); persistLocal(); dirty = false; }
      else { dirty = true; }
    }
    fetchError = err;
    render();
  }

  function syncState() {
    const el = $("syncState");
    const when = data.updated
      ? new Date(data.updated).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-GB",
          { year: "numeric", month: "short", day: "numeric" })
      : "–";
    $("stamp").textContent = t("lastChange", { when: when });
    if (fetchError) { el.textContent = fetchError + " " + t("localCopy"); return; }
    if (!editing) { el.textContent = t("lastChangeDot", { when: when }); return; }
    el.textContent = dirty ? t("unsaved") : t("inSync");
  }

  // ── map ────────────────────────────────────────────────────────────────────
  const W = 900, PAD = 22;
  let H = 640;

  function projectionFor(view) {
    let p;
    if (view.type === "equalEarth") p = d3.geoEqualEarth();
    else if (view.type === "conicConformal") p = d3.geoConicConformal().parallels(view.parallels || [30, 60]);
    else if (view.type === "conicEqualArea") p = d3.geoConicEqualArea().parallels(view.parallels || [20, 50]);
    else p = d3.geoMercator();
    return p.rotate(view.rotate || [0, 0]);
  }

  // Every view is framed on the projected outline of the countries it actually contains, so the
  // canvas takes the region's own proportions instead of a lat/lon box – no lopsided margins.
  const H_CAP = 760, H_MIN = 340;
  function inBbox(ll, b) {
    let x = ll[0];
    if (b[1][0] > 180 && x < b[0][0]) x += 360;
    return x >= b[0][0] - 2 && x <= b[1][0] + 2 && ll[1] >= b[0][1] - 2 && ll[1] <= b[1][1] + 2;
  }
  // The world view frames the real outlines, so land touches both edges. Antarctica is left out
  // of the measurement – its reach to the pole would squash everything else.
  function geomFeature(view, name) {
    const ids = new Set(inScope(name).map(c => c.id));
    const geoms = world.filter(f => { const k = featureKey(f); return ids.has(k) && k !== "010"; })
      .map(f => f.geometry).filter(Boolean);
    return geoms.length
      ? { type: "Feature", geometry: { type: "GeometryCollection", geometries: geoms } }
      : bboxFeature(view.bbox);
  }

  // Sample of where the region's countries actually reach, clipped to the view box so a country
  // with a long tail (Russia across Siberia) cannot drag the frame off its own continent.
  function scopeFeature(view, name) {
    const v = view.bbox;
    const ids = new Set(inScope(name).filter(c => inBbox(c.ll, v)).map(c => c.id));
    const pts = [];
    world.forEach(f => {
      if (!ids.has(featureKey(f))) return;
      const b = d3.geoBounds(f);
      if (!isFinite(b[0][0]) || !isFinite(b[0][1])) return;
      let x0 = b[0][0], x1 = b[1][0];
      if (x1 < x0) x1 = 180;                       // crosses the antimeridian
      if (v[1][0] > 180) { if (x0 < v[0][0]) { x0 += 360; x1 += 360; } }
      x0 = Math.max(x0, v[0][0]); x1 = Math.min(x1, v[1][0]);
      const y0 = Math.max(b[0][1], v[0][1]), y1 = Math.min(b[1][1], v[1][1]);
      if (x1 <= x0 || y1 <= y0) return;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        pts.push([x, y0], [x, y1], [x0, y], [x1, y]);
      }
    });
    if (!pts.length) return bboxFeature(v);
    return { type: "Feature", geometry: { type: "MultiPoint", coordinates: pts } };
  }
  function fitView(view, name) {
    const p = view.pad != null ? view.pad : PAD;
    const inner = W - 2 * p;
    const f = view.fitBox ? bboxFeature(view.bbox)
      : view.fitGeom ? geomFeature(view, name)
      : scopeFeature(view, name);
    const pr = projectionFor(view).fitExtent([[0, 0], [inner, inner]], f);
    const bn = d3.geoPath(pr).bounds(f);
    const w = bn[1][0] - bn[0][0], hh = bn[1][1] - bn[0][1];
    let ratio = (w > 0 && isFinite(hh) && hh > 0) ? hh / w : 0.62;
    ratio = Math.max((H_MIN - 2 * p) / inner, Math.min((H_CAP - 2 * p) / inner, ratio));
    return { feature: f, pad: p, h: Math.round(inner * ratio + 2 * p) };
  }

  // Sampled outline of the view box. Points (not a polygon) so d3 measures the exact
  // projected extent – a near-global polygon would be mangled by antimeridian clipping.
  function bboxFeature(b) {
    const [[x0, y0], [x1, y1]] = b;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      pts.push([x, y0], [x, y1], [x0, y], [x1, y]);
    }
    return { type: "Feature", geometry: { type: "MultiPoint", coordinates: pts } };
  }

  const kindClass = c => c.kind === "state" ? "" : " k-" + c.kind;

  // Callout placement. Anchors sit at the true location; the circles are pushed out until
  // clear. Dense clusters (the Antilles, the Aegean) are stacked in a column beside the
  // cluster so the stalks run parallel instead of radiating into a starburst.
  function placeCallouts(items, proj) {
    const R = 8, MIN = 23, CLUSTER = 58, placed = [], out = [];
    const staged = [];
    items.forEach(it => {
      const p = proj(it.ll);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
      // Far-off places (Svalbard on the Europe view) are pinned to the nearest edge, not dropped.
      if (p[0] < -3 * W || p[0] > 4 * W || p[1] < -3 * H || p[1] > 4 * H) return;
      staged.push({ it: it, ax: Math.max(5, Math.min(W - 5, p[0])), ay: Math.max(5, Math.min(H - 5, p[1])) });
    });
    staged.sort((a, b) => a.ax - b.ax || a.ay - b.ay);

    const groups = [];
    staged.forEach(s => {
      const g = groups.find(q => Math.hypot(q.cx - s.ax, q.cy - s.ay) < CLUSTER);
      if (g) {
        g.items.push(s);
        g.cx = g.items.reduce((t, m) => t + m.ax, 0) / g.items.length;
        g.cy = g.items.reduce((t, m) => t + m.ay, 0) / g.items.length;
      } else groups.push({ cx: s.ax, cy: s.ay, items: [s] });
    });

    const commit = (s, x, y) => {
      s.it.ax = s.ax; s.it.ay = s.ay; s.it.cx = x; s.it.cy = y;
      placed.push({ x: x, y: y });
      out.push(s.it);
    };

    // Dense clusters (the Antilles, the Aegean) stay on their real positions: the rings just
    // shrink and nudge each other apart, which keeps the geography readable.
    groups.filter(g => g.items.length >= 4).forEach(g => {
      const r = 5.5, need = 14;
      const pts = g.items.map(s => ({ s: s, x: s.ax, y: s.ay }));
      for (let step = 0; step < 220; step++) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
            const d = Math.hypot(dx, dy) || 0.01;
            if (d < need) {
              const push = (need - d) / 2 / d;
              pts[i].x -= dx * push; pts[i].y -= dy * push;
              pts[j].x += dx * push; pts[j].y += dy * push;
            }
          }
        }
        pts.forEach(p => { p.x += (p.s.ax - p.x) * 0.02; p.y += (p.s.ay - p.y) * 0.02; });
      }
      pts.forEach(p => {
        p.s.it.r = r;
        commit(p.s, Math.max(r + 3, Math.min(W - r - 3, p.x)), Math.max(r + 3, Math.min(H - r - 3, p.y)));
      });
    });

    // Everything else: spiral outwards from the anchor until the ring is clear.
    groups.filter(g => g.items.length < 4).forEach(g => g.items.forEach(s => {
      let best = null;
      for (let d = 16; d <= 130 && !best; d += 8) {
        const n = Math.max(10, Math.round(d / 1.6));
        for (let i = 0; i < n && !best; i++) {
          const step = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (2 * Math.PI / n);
          const a = -Math.PI / 2 + step;
          const x = s.ax + Math.cos(a) * d, y = s.ay + Math.sin(a) * d;
          if (x < R + 3 || x > W - R - 3 || y < R + 3 || y > H - R - 3) continue;
          if (placed.every(q => Math.hypot(q.x - x, q.y - y) >= MIN)) best = { x: x, y: y };
        }
      }
      if (!best) best = { x: s.ax, y: Math.max(R + 3, s.ay - 16) };
      commit(s, best.x, best.y);
    }));

    return out;
  }

  function drawMap() {
    if (!world) return;
    const view = VIEW[scope];
    const fit = fitView(view, scope);
    H = fit.h;
    d3.select("#map").attr("viewBox", "0 0 " + W + " " + H);
    const proj = projectionFor(view)
      .fitExtent([[fit.pad, fit.pad], [W - fit.pad, H - fit.pad]], fit.feature);
    if (view.shift) { const t = proj.translate(); proj.translate([t[0] + view.shift * W, t[1]]); }
    $("projLabel").textContent = (lang === "cs" ? view.labelCs : view.label) || view.label || "";

    // The world view crops to the drawn land, so there is no ocean margin at the sides.
    if (view.fitGeom) requestAnimationFrame(() => {
      const parts = ["gOut", "gIn"].map(id => $(id).getBBox()).filter(b => b.width > 0);
      if (!parts.length) return;
      const x0 = Math.min.apply(null, parts.map(b => b.x));
      const x1 = Math.max.apply(null, parts.map(b => b.x + b.width));
      d3.select("#map").attr("viewBox", (x0 - 4) + " 0 " + (x1 - x0 + 8) + " " + H);
    });
    const path = d3.geoPath(proj);

    const locked = !stats(scope).unlocked && !editing;
    const here = inScope(scope);
    const hereIds = new Set(here.map(c => c.id));
    const inS = f => hereIds.has(featureKey(f));

    d3.select("#gOut").selectAll("path").data(world.filter(f => !inS(f)), (f, i) => i)
      .join("path").attr("class", "c-out").attr("d", path);

    const outlines = here.filter(c => haveGeom.has(c.id) && !c.tiny);
    const outlineIds = new Set(outlines.map(c => c.id));

    d3.select("#gIn").selectAll("path").data(world.filter(f => outlineIds.has(featureKey(f))), featureKey)
      .join(enter => { const p = enter.append("path"); p.append("title"); return p; })
      .attr("d", path)
      .attr("class", f => {
        const c = BY_ID.get(featureKey(f));
        if (locked) return "c-ghost";
        let cls = "c-in" + kindClass(c);
        if (isVisited(c.id)) cls += " visited";
        if (c.id === selected) cls += " sel";
        return cls;
      })
      .style("pointer-events", locked ? "none" : null)
      .on("click", (ev, f) => { if (!locked) select(featureKey(f)); })
      .select("title").text(f => { const c = BY_ID.get(featureKey(f)); return c ? c.name : ""; });

    // The selection outline sits on its own layer, so no neighbouring country paints over it.
    d3.select("#gSel").selectAll("path")
      .data((locked || !selected || !outlineIds.has(selected))
        ? [] : world.filter(f => featureKey(f) === selected), featureKey)
      .join("path").attr("class", "c-sel").attr("d", path);

    // Callout circles for places too small to draw, hidden on the world view.
    const pool = here.filter(c => !outlineIds.has(c.id));
    pool.forEach(c => { c.r = 8; });
    const smalls = (locked || scope === "World") ? [] : placeCallouts(pool, proj);

    d3.select("#gPucks").selectAll("g.puck").data(smalls, c => c.id)
      .join(enter => {
        const g = enter.append("g");
        g.append("line").attr("class", "stalk");
        g.append("circle").attr("class", "anchor").attr("r", 1.8);
        g.append("circle").attr("class", "ring");
        g.append("circle").attr("class", "capdot");
        g.append("title");
        return g;
      })
      .attr("class", c => {
        let cls = "puck" + kindClass(c);
        if (isVisited(c.id)) cls += " visited";
        if (c.id === selected) cls += " sel";
        return cls;
      })
      .on("click", (ev, c) => select(c.id))
      .call(g => {
        const near = c => Math.hypot(c.cx - c.ax, c.cy - c.ay) < 5;
        g.select("line.stalk")
          .attr("x1", c => c.ax).attr("y1", c => c.ay).attr("x2", c => c.cx).attr("y2", c => c.cy)
          .attr("opacity", c => near(c) ? 0 : 1);
        g.select("circle.anchor").attr("cx", c => c.ax).attr("cy", c => c.ay)
          .attr("r", 1.8).attr("opacity", c => near(c) ? 0 : 1);
        g.select("circle.ring").attr("cx", c => c.cx).attr("cy", c => c.cy).attr("r", c => c.r || 8);
        g.select("circle.capdot").attr("cx", c => c.cx).attr("cy", c => c.cy)
          .attr("r", c => (c.r || 8) > 6 ? 2.6 : 1.9)
          .attr("opacity", c => { const r = rec(c.id); return r && r.capital ? 1 : 0; });
      })
      .select("title").text(c => c.name);

    // Capital dots: only for capitals actually visited.
    const caps = (locked || scope === "World") ? []
      : outlines.filter(c => { const r = rec(c.id); return r && r.capital; });
    d3.select("#gCaps").selectAll("circle").data(caps, c => c.id)
      .join("circle").attr("class", "capdot on").attr("r", 2.4)
      .attr("cx", c => { const p = proj(c.ll); return p ? p[0] : -99; })
      .attr("cy", c => { const p = proj(c.ll); return p ? p[1] : -99; });
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    const s = stats(scope);
    $("scopeLabel").textContent = T().ofScope[scope] || contName(scope);
    $("pct").innerHTML = (s.pct > 0 && s.pct < 10 ? s.pct.toFixed(1) : Math.round(s.pct)) + "<small>%</small>";
    $("cnt").innerHTML = s.visitedStates + "<small> / " + s.states + "</small>";
    $("caps").innerHTML = s.capStates + "<small> / " + s.states + "</small>";
    $("pctBar").style.width = s.pct + "%";
    $("cntBar").style.width = s.pct + "%";
    $("capsBar").style.width = (s.states ? (s.capStates / s.states) * 100 : 0) + "%";

    const tabs = $("tabs");
    tabs.innerHTML = "";
    SCOPES.forEach(name => {
      const st = stats(name);
      const lk = !st.unlocked && !editing;
      const b = document.createElement("button");
      b.className = "tab" + (lk ? " lk" : "") + (name === "World" ? " world" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(name === scope));
      b.innerHTML = '<span class="n"></span><span class="c"></span>';
      b.querySelector(".n").textContent = contName(name);
      b.querySelector(".c").textContent = lk ? t("locked") : st.visitedStates + " " + t("of") + " " + st.states;
      b.onclick = () => { scope = name; selected = null; render(); };
      tabs.appendChild(b);
    });

    const locked = !s.unlocked && !editing;
    $("mapCaption").textContent = contName(scope);
    $("lockveil").hidden = !locked;
    $("lockTitle").textContent = t("lockedTitle", { scope: contName(scope) });
    $("lockText").textContent = t("lockedText");
    $("clearBtn").hidden = !selected;
    $("pwChangeBtn").hidden = !editing;
    $("dataPanel").hidden = !editing;

    drawMap();
    renderVisitedFlags(locked);
    renderList(locked);
    renderDetail();
    syncState();
  }

  // Flags of the places already marked here – the panel disappears when there are none.
  function renderVisitedFlags(locked) {
    const host = $("visitedFlags");
    const items = locked ? [] : inScope(scope).filter(c => isVisited(c.id) && ISO_A2[c.id]).slice().sort(byName);
    $("visitedPanel").hidden = !items.length;
    host.innerHTML = "";
    items.forEach(c => {
      const b = document.createElement("button");
      b.className = "flagchip" + (c.id === selected ? " sel" : "");
      b.title = nameOf(c);
      b.setAttribute("aria-label", nameOf(c));
      const img = document.createElement("img");
      img.src = "https://flagcdn.com/" + ISO_A2[c.id] + ".svg";
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => b.remove();
      b.appendChild(img);
      b.onclick = () => select(c.id);
      host.appendChild(b);
    });
  }

  const GROUPS = [
    { kind: "state", key: "groupState" },
    { kind: "partial", key: "groupPartial" },
    { kind: "territory", key: "groupTerritory" }
  ];

  function renderList(locked) {
    const s = stats(scope);
    $("listTitle").textContent = contName(scope);
    $("listCount").textContent = locked
      ? t("lockedWaiting", { n: s.places })
      : t("countriesVisited", { a: s.visitedStates, b: s.states });
    const host = $("lists");
    host.innerHTML = "";

    GROUPS.forEach(g => {
      const items = inScope(scope).filter(c => c.kind === g.kind).slice().sort(byName);
      if (!items.length) return;
      const h = document.createElement("h4");
      h.className = "grouphead";
      h.innerHTML = '<span class="sw ' + g.kind + '"></span><span class="gl"></span><span class="gc"></span>';
      h.querySelector(".gl").textContent = t(g.key);
      const gv = items.filter(c => isVisited(c.id)).length;
      h.querySelector(".gc").textContent = locked
        ? String(items.length) : gv + " " + t("of") + " " + items.length;
      if (locked) h.classList.add("lk");
      host.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "grid";
      items.forEach(c => {
        const r = rec(c.id);
        const b = document.createElement("button");
        b.className = "tile k-" + c.kind + (locked ? " lk" : (r ? " on" : "")) + (!locked && c.id === selected ? " sel" : "");
        if (locked) { b.disabled = true; b.title = t("lockedTile"); }
        b.innerHTML = '<span class="lbl"><span class="fl"></span><span class="t"></span></span><span class="y"></span>';
        b.querySelector(".t").textContent = nameOf(c);
        const fl = b.querySelector(".fl");
        const a2 = ISO_A2[c.id];
        if (a2) {
          const img = document.createElement("img");
          img.src = "https://flagcdn.com/" + a2 + ".svg";
          img.alt = "";
          img.loading = "lazy";
          img.onerror = () => fl.remove();
          fl.appendChild(img);
        } else fl.remove();
        const y = b.querySelector(".y");
        if (r && !locked) {
          const txt = document.createElement("span");
          txt.textContent = r.year ? String(r.year) : t("visitedShort");
          y.appendChild(txt);
          if (r.capital) { const d = document.createElement("span"); d.className = "dot"; d.title = t("capitalSeen"); y.appendChild(d); }
        }
        b.onclick = () => select(c.id);
        grid.appendChild(b);
      });
      host.appendChild(grid);
    });
  }

  const KIND_KEY = { state: "kindState", partial: "kindPartial", territory: "kindTerritory" };

  function renderDetail() {
    const c = selected ? BY_ID.get(selected) : null;
    $("detailPanel").hidden = !c;
    if (!c) return;
    const r = rec(c.id);
    const a2 = ISO_A2[c.id];
    const dfl = $("dFlag");
    dfl.innerHTML = "";
    dfl.hidden = !a2;
    if (a2) {
      const img = document.createElement("img");
      img.src = "https://flagcdn.com/" + a2 + ".svg";
      img.alt = "";
      img.onerror = () => { dfl.hidden = true; };
      dfl.appendChild(img);
    }
    $("dName").textContent = nameOf(c);
    $("dMeta").textContent = t(KIND_KEY[c.kind]) + " · " + capOf(c);
    $("fVisited").setAttribute("aria-checked", String(!!r));
    $("fCap").setAttribute("aria-checked", String(!!(r && r.capital)));
    $("fYear").value = r && r.year ? r.year : "";
    $("fYear").disabled = !editing || !r;
    $("fVisited").disabled = !editing;
    $("fCap").disabled = !editing || !r;
    $("dHint").hidden = editing;
  }

  function select(id) { if (!id) return; selected = id; render(); }

  // ── editing ────────────────────────────────────────────────────────────────
  $("fVisited").onclick = () => {
    if (!editing || !selected) return;
    if (isVisited(selected)) delete data.countries[selected];
    else data.countries[selected] = { year: null, capital: false };
    touch();
  };
  $("fCap").onclick = () => {
    if (!editing || !selected) return;
    const r = rec(selected); if (!r) return;
    r.capital = !r.capital;
    touch();
  };
  $("fYear").onchange = () => {
    if (!editing || !selected) return;
    const r = rec(selected); if (!r) return;
    const n = parseInt($("fYear").value, 10);
    r.year = Number.isFinite(n) ? n : null;
    touch();
  };
  $("clearBtn").onclick = () => { selected = null; render(); };

  // ── auth ───────────────────────────────────────────────────────────────────
  async function sha256(s) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function sessionChrome() {
    $("mode").textContent = editing ? t("editing") : t("reading");
    $("mode").classList.toggle("live", editing);
    $("unlockBtn").textContent = editing ? t("signOut") : t("signIn");
    const sb = $("saveBtn");
    if (!sb.disabled) sb.textContent = t("save");
  }

  function setEditing(on) {
    editing = on;
    sessionChrome();
    $("saveBtn").hidden = !on;
    render();
  }

  $("unlockBtn").onclick = () => {
    if (editing) { $("logoutDlg").showModal(); return; }
    $("pwErr").textContent = ""; $("pw").value = "";
    $("loginDlg").showModal(); $("pw").focus();
  };
  $("loginCancel").onclick = () => $("loginDlg").close();
  $("logoutCancel").onclick = () => $("logoutDlg").close();
  $("logoutGo").onclick = () => {
    $("logoutDlg").close();
    sessionStorage.removeItem(SS_SESSION);
    setEditing(false);
  };
  $("pw").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("loginGo").click(); } };
  $("loginGo").onclick = async () => {
    if ((await sha256($("pw").value)) !== CFG.passwordHash) { $("pwErr").textContent = t("badPassword"); return; }
    sessionStorage.setItem(SS_SESSION, "1");
    $("loginDlg").close();
    setEditing(true);
  };

  // ── save to GitHub ─────────────────────────────────────────────────────────
  const b64 = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));

  async function pushToGitHub(token) {
    const g = CFG.github;
    const api = "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" + g.path;
    const head = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    let sha = null;
    const cur = await fetch(api + "?ref=" + g.branch, { headers: head });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status === 401) throw new Error("Token rejected. Check that it was pasted in full and has not expired.");
    else if (cur.status === 403) throw new Error("Token lacks permission. It needs Contents: Read and write for " + g.owner + "/" + g.repo + ".");
    else if (cur.status !== 404) throw new Error("Cannot read the file (" + cur.status + ").");
    const body = {
      message: "Update travel record (" + visitedIds().length + " places)",
      content: b64(JSON.stringify(data, null, 2) + "\n"),
      branch: g.branch
    };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
    if (!put.ok) {
      const msg = await put.text();
      if (put.status === 404) throw new Error("Repository " + g.owner + "/" + g.repo + " not found, or the token has no access to it. Check assets/config.js and the token's Contents: Read and write permission.");
      if (put.status === 401) throw new Error("Token rejected. Check that it was pasted in full and has not expired.");
      if (put.status === 403) throw new Error("Token lacks permission to write to " + g.owner + "/" + g.repo + ".");
      if (put.status === 409) throw new Error("Branch " + g.branch + " is out of sync. Reload the page and try again.");
      throw new Error("Save failed (" + put.status + "). " + msg.slice(0, 120));
    }
  }

  $("saveBtn").onclick = () => {
    const tk = localStorage.getItem(LS_TOKEN);
    if (tk) { doSave(tk); return; }
    $("tokErr").textContent = ""; $("tok").value = "";
    $("tokenDlg").showModal(); $("tok").focus();
  };
  $("tokCancel").onclick = () => $("tokenDlg").close();
  $("tokGo").onclick = () => {
    const tk = $("tok").value.trim();
    if (!tk) { $("tokErr").textContent = t("tokenMissing"); return; }
    $("tokenDlg").close();
    localStorage.setItem(LS_TOKEN, tk);
    doSave(tk);
  };

  async function doSave(token) {
    const btn = $("saveBtn");
    btn.disabled = true; btn.textContent = t("saving");
    try {
      await pushToGitHub(token);
      dirty = false;
      btn.textContent = t("saved");
      setTimeout(() => { btn.textContent = t("save"); btn.disabled = false; }, 1400);
      syncState();
    } catch (e) {
      localStorage.removeItem(LS_TOKEN);
      btn.textContent = t("save"); btn.disabled = false;
      $("syncState").textContent = e.message;
    }
  }

  $("pwChangeBtn").onclick = () => {
    $("pwNew").value = ""; $("pwOut").hidden = true; $("pwOut").textContent = "";
    $("pwDlg").showModal(); $("pwNew").focus();
  };
  $("pwClose").onclick = () => $("pwDlg").close();
  $("pwNew").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("pwMake").click(); } };
  $("pwMake").onclick = async () => {
    const v = $("pwNew").value;
    if (!v) return;
    const out = $("pwOut");
    out.textContent = 'passwordHash: "' + (await sha256(v)) + '",';
    out.hidden = false;
  };

  // ── GeoJSON export ─────────────────────────────────────────────────────────
  // Geometry: Natural Earth 1:110m Admin 0, via world-atlas TopoJSON (public domain).
  // world-atlas keeps Russia, Fiji and Antarctica as single rings running across the
  // antimeridian. Valid GeoJSON needs them cut at ±180, or viewers draw a band round the globe.
  function unwrapRing(r) {
    const out = [r[0].slice()];
    for (let i = 1; i < r.length; i++) {
      let x = r[i][0];
      const px = out[i - 1][0];
      while (x - px > 180) x -= 360;
      while (px - x > 180) x += 360;
      out.push([x, r[i][1]]);
    }
    return out;
  }
  function clipLon(poly, lo, hi) {
    [[1, lo], [-1, -hi]].forEach(pair => {
      const s = pair[0], b = pair[1], res = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const dp = s * p[0] - b, dq = s * q[0] - b;
        if (dp >= 0) res.push(p);
        if ((dp >= 0) !== (dq >= 0)) {
          const t = dp / (dp - dq);
          res.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      poly = res;
    });
    return poly;
  }
  function splitRing(r) {
    const u = unwrapRing(r);
    const xs = u.map(p => p[0]);
    const lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
    if (lo >= -180 && hi <= 180) return [r];
    const parts = [];
    for (let k = Math.floor((lo + 180) / 360); k <= Math.floor((hi + 180) / 360); k++) {
      const p = clipLon(u, -180 + 360 * k, 180 + 360 * k);
      if (p.length > 2) {
        const shifted = p.map(q => [Math.max(-180, Math.min(180, +(q[0] - 360 * k).toFixed(6))), +q[1].toFixed(6)]);
        shifted.push(shifted[0].slice());
        parts.push(shifted);
      }
    }
    return parts.length ? parts : [r];
  }
  function cleanGeometry(g) {
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const out = [];
    polys.forEach(rings => {
      const parts = splitRing(rings[0]);
      if (parts.length === 1) out.push(rings);
      else parts.forEach(p => out.push([p]));
    });
    return out.length === 1
      ? { type: "Polygon", coordinates: out[0] }
      : { type: "MultiPolygon", coordinates: out };
  }

  // Russia sits under Europe in the counts, but a map of Asia without it is not a map of Asia.
  const EXPORT_EXTRA = { Asia: ["643"] };

  function geojsonFor(scope) {
    const feats = [];
    world.forEach(f => {
      const k = featureKey(f);
      const c = k && BY_ID.get(k);
      if (!c) return;
      const extra = EXPORT_EXTRA[scope] || [];
      if (scope !== "World" && c.continent !== scope && extra.indexOf(c.id) < 0) return;
      feats.push({
        type: "Feature",
        properties: { name: c.name, iso: c.id, continent: c.continent },
        geometry: cleanGeometry(f.geometry)
      });
    });
    feats.sort((p, q) => p.properties.name.localeCompare(q.properties.name));
    return {
      type: "FeatureCollection",
      name: "travelmap_" + scope.toLowerCase().replace(/ /g, "_"),
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: feats
    };
  }

  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildDownloads() {
    const grid = $("dlgrid");
    if (!grid) return;
    grid.innerHTML = "";
    ["World"].concat(CONTS).forEach(scope => {
      const b = document.createElement("button");
      b.className = "dlbtn";
      b.innerHTML = '<span class="s"></span><span class="f">GeoJSON</span>';
      b.querySelector(".s").textContent = contName(scope);
      b.onclick = () => {
        const gj = geojsonFor(scope);
        if (!gj.features.length) { b.querySelector(".f").textContent = t("noData"); return; }
        download("travelmap_" + scope.toLowerCase().replace(/ /g, "_") + ".geojson",
          JSON.stringify(gj), "application/geo+json");
      };
      grid.appendChild(b);
    });
  }

  function bindExport() {
    const eb = $("exportBtn");
    if (eb) eb.onclick = exportTravelJson;
    if (world) buildDownloads();
  }

  function exportTravelJson() {
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "travel.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")
    .then(topo => {
      world = topojson.feature(topo, topo.objects.countries).features;
      world.forEach(f => { const k = featureKey(f); if (k) haveGeom.add(k); });
      bindExport();
      render();
    })
    .catch(() => { $("mapCaption").textContent = t("mapUnavailable", { scope: contName(scope) }); });

  document.querySelectorAll(".lang").forEach(b => { b.onclick = () => setLang(b.dataset.lang); });
  applyStatic();

  if (sessionStorage.getItem(SS_SESSION) === "1") setEditing(true);
  load();
})();
