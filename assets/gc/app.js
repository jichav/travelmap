// Geocaching page: Czech kraje and okresy, recorded at two levels.
//   kraj  — the 9×9 difficulty/terrain matrix, nothing else
//   okres — cache types, sizes, terrain steps and difficulty steps
// The map carries no status fill; at okres level each okres is labelled with what is
// still MISSING there, which is the only thing worth reading off a map. Everything else
// lives in the analysis below the map and is reached by clicking the map.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CFG = window.CONFIG;
  const SS = "travelmap.gc.v1";
  const LS_DATA = "travelmap.geocaching.v3";
  const LS_TOKEN = "travelmap.token.v1";
  const DATA_PATH = (CFG.github && CFG.github.gcPath) || "data/geocaching.json";

  const TYPES = [
    { k: "trad", label: "Tradiční" },
    { k: "multi", label: "Multi" },
    { k: "mystery", label: "Mystery" },
    { k: "letterbox", label: "Letterbox" },
    { k: "wherigo", label: "Wherigo" },
    { k: "earth", label: "Earthcache" },
    { k: "virtual", label: "Virtuální" },
    { k: "event", label: "Event" },
    { k: "cito", label: "CITO" }
  ];
  const SIZES = ["XS", "S", "M", "L", "O", "NCH"];
  const STEPS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
  const num = v => String(v).replace(".", ",");
  const icon = k => "assets/gc-icons/" + k + ".png";

  const GROUPS = [
    { key: "types", label: "Typy", opts: TYPES.map(t => t.k), n: 9,
      text: k => (TYPES.find(t => t.k === k) || {}).label, tok: k => ({ icon: k }) },
    { key: "sizes", label: "Velikosti", opts: SIZES, n: 6, text: v => v, tok: v => ({ text: v }) },
    { key: "terrain", label: "Terén", opts: STEPS, n: 9,
      text: v => "T" + num(v), tok: v => ({ text: "T" + num(v) }) },
    { key: "diff", label: "Obtížnost", opts: STEPS, n: 9,
      text: v => "D" + num(v), tok: v => ({ text: "D" + num(v) }) }
  ];

  const s = {
    data: { updated: null, regions: {}, districts: {} },
    districts: [], regions: [], topo: null, world: null,
    level: "districts", selected: null, selKraj: null,
    dirty: false, fetchError: null, mapError: false
  };

  const dRec = id => s.data.districts[id] || null;
  const has = (id, key, val) => { const r = dRec(id); return !!r && (r[key] || []).indexOf(val) >= 0; };
  const missing = (id, g) => g.opts.filter(v => !has(id, g.key, v));
  const missCount = id => GROUPS.reduce((n, g) => n + missing(id, g).length, 0);
  const mRec = id => (s.data.regions[id] && s.data.regions[id].matrix) || [];
  const cell = (d, t) => d + "/" + t;
  const mHas = (id, d, t) => mRec(id).indexOf(cell(d, t)) >= 0;
  const mMiss = id => 81 - mRec(id).length;
  const pct = (got, all) => Math.round((got / all) * 100) + " %";
  const regionOf = id => s.regions.find(r => r.id === id) || null;

  // ── geometry ───────────────────────────────────────────────────────────────
  const HALF = 2 * Math.PI;
  function rewindRings(rings) {
    return rings.map((ring, i) => {
      const big = d3.geoArea({ type: "Polygon", coordinates: [ring] }) > HALF;
      return big === (i > 0) ? ring : ring.slice().reverse();
    });
  }
  function rewind(f) {
    const g = f.geometry;
    if (!g) return f;
    if (g.type === "Polygon") g.coordinates = rewindRings(g.coordinates);
    else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(rewindRings);
    return f;
  }

  async function loadGeometry() {
    const [a2, topo] = await Promise.all([
      d3.json(window.REGION_SOURCE.url("CZE", "ADM2")),
      d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json")
    ]);
    a2.features.forEach(rewind);
    a2.features.forEach(f => {
      const raw = (f.properties && f.properties.shapeName) || "";
      const nm = window.CZ_DISTRICT_NAMES[raw] || { cs: raw, en: raw };
      f.properties.tmName = nm.cs;
      f.properties.tmParent = window.CZ_DISTRICT_PARENT[nm.cs] || null;
    });

    const tp = topojson.topology({ d: a2 }, 1e5);
    const geoms = tp.objects.d.geometries;
    const feats = topojson.feature(tp, tp.objects.d).features;
    s.topo = tp;
    s.districts = feats.map((f, i) => {
      const id = window.slugId("CZ", f.properties.tmName);
      f.properties.tmId = id;
      geoms[i].properties.tmId = id;
      geoms[i].properties.tmKraj = f.properties.tmParent;
      return { id: id, name: f.properties.tmName, parent: f.properties.tmParent, f: f };
    });
    // Kraje are the okres topology dissolved on the parent code, so the two levels share edges.
    s.regions = Object.keys(window.CZ_REGIONS).map(cz => {
      const id = window.CZ_REGIONS[cz].id;
      const parts = geoms.filter(g => g.properties && g.properties.tmKraj === id);
      const geom = parts.length ? topojson.merge(tp, parts) : null;
      return { id: id, name: cz, f: geom ? { type: "Feature", properties: {}, geometry: geom } : null };
    }).filter(r => r.f);
    s.world = topojson.feature(topo, topo.objects.countries).features;
  }

  // ── map ────────────────────────────────────────────────────────────────────
  const W = 1000, PAD = 16;
  let H = 620, path = null;

  function drawMap() {
    if (!s.districts.length) return;
    const fc = { type: "FeatureCollection", features: s.districts.map(u => u.f) };
    const inner = W - 2 * PAD;
    const test = d3.geoTransverseMercator().rotate([-15, 0]).fitExtent([[0, 0], [inner, inner]], fc);
    const bn = d3.geoPath(test).bounds(fc);
    const ratio = (bn[1][1] - bn[0][1]) / (bn[1][0] - bn[0][0]) || 0.62;
    H = Math.round(inner * ratio + 2 * PAD);
    d3.select("#map").attr("viewBox", "0 0 " + W + " " + H);

    const proj = d3.geoTransverseMercator().rotate([-15, 0])
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], fc);
    path = d3.geoPath(proj);

    d3.select("#gWorld").selectAll("path").data(s.world || [], (d, i) => i)
      .join("path").attr("class", "c-out").attr("d", path);

    const units = s.level === "regions" ? s.regions : s.districts;
    // Two tints keyed by kraj: no status is encoded, the shapes just have to read.
    const tint = u => {
      const kid = s.level === "regions" ? u.id : u.parent;
      const i = s.regions.findIndex(r => r.id === kid);
      return i % 2 ? " b" : "";
    };
    d3.select("#gUnits").selectAll("path").data(units, u => u.id)
      .join(enter => { const p = enter.append("path"); p.append("title"); return p; })
      .attr("d", u => path(u.f))
      .attr("class", u => "u" + tint(u) + (u.id === s.selected ? " sel" : ""))
      .on("click", (ev, u) => select(u.id))
      .select("title").text(u => s.level === "regions"
        ? u.name + " · chybí " + mMiss(u.id) + " z 81"
        : u.name + " · chybí " + missCount(u.id));

    const tp = s.topo, obj = tp && tp.objects.d;
    const mesh = obj ? [topojson.mesh(tp, obj, (a, b) =>
      a === b || a.properties.tmParent !== b.properties.tmParent)] : [];
    d3.select("#gEdge").selectAll("path").data(mesh)
      .join("path").attr("class", "u-edge").attr("d", path);

    drawLabels();
    scaleBar(proj);
  }

  // Missing items, written into the okres itself. Wrapped into rows so a small okres
  // still fits three tokens across.
  const TOK_H = 11, ICON = 9.5, ROW_MAX = 52;
  function tokens(u) {
    const out = [];
    GROUPS.forEach(g => missing(u.id, g).forEach(v => {
      const t = g.tok(v);
      out.push(t.icon ? { icon: t.icon, w: ICON + 2 } : { text: t.text, w: 7 + t.text.length * 4.2 });
    }));
    return out;
  }
  function drawLabels() {
    const host = d3.select("#gLab");
    if (s.level === "regions") {
      host.selectAll("g.lab").remove();
      // Prague sits inside the Central Bohemian centroid, so the two labels are pulled apart.
      const nudge = { "CZ-10": [0, -13], "CZ-20": [24, 26] };
      const kd = s.regions.map(r => {
        const c = path.centroid(r.f), n = nudge[r.id] || [0, 0];
        return { r: r, x: c[0] + n[0], y: c[1] + n[1] };
      }).filter(d => isFinite(d.x));
      const kg = host.selectAll("g.klab").data(kd, d => d.r.id)
        .join(enter => {
          const g = enter.append("g").attr("class", "klab");
          g.append("text").attr("class", "kp").attr("text-anchor", "middle");
          g.append("text").attr("class", "kn").attr("text-anchor", "middle");
          return g;
        })
        .attr("transform", d => "translate(" + d.x + "," + d.y + ")");
      kg.select("text.kp").attr("y", 0).text(d => pct(81 - mMiss(d.r.id), 81));
      kg.select("text.kn").attr("y", 11)
        .text(d => d.r.name.replace(/ kraj$/, "").replace(/^Kraj /, "").replace(/^Hlavní město /, ""));
      return;
    }
    host.selectAll("g.klab").remove();
    const data = s.districts.map(u => {
      const c = path.centroid(u.f);
      return { u: u, x: c[0], y: c[1], toks: tokens(u) };
    }).filter(d => d.toks.length && isFinite(d.x));

    const g = host.selectAll("g.lab").data(data, d => d.u.id)
      .join(enter => enter.append("g").attr("class", "lab"));
    g.attr("transform", d => "translate(" + d.x + "," + d.y + ")").html("");
    g.each(function (d) {
      const rows = [[]];
      let w = 0;
      d.toks.forEach(t => {
        if (w + t.w > ROW_MAX && rows[rows.length - 1].length) { rows.push([]); w = 0; }
        rows[rows.length - 1].push(t); w += t.w;
      });
      const gg = d3.select(this);
      const y0 = -((rows.length - 1) * TOK_H) / 2;
      rows.forEach((row, ri) => {
        const rw = row.reduce((a, t) => a + t.w, 0);
        let x = -rw / 2;
        const y = y0 + ri * TOK_H;
        row.forEach(t => {
          if (t.icon) {
            gg.append("image").attr("href", icon(t.icon))
              .attr("x", x + 1).attr("y", y - ICON / 2).attr("width", ICON).attr("height", ICON);
          } else {
            gg.append("text").attr("class", "tok").attr("x", x + t.w / 2).attr("y", y + 2.6)
              .attr("text-anchor", "middle").text(t.text);
          }
          x += t.w;
        });
      });
    });
  }

  function scaleBar(proj) {
    const a = proj.invert([W / 2, H / 2]), b = proj.invert([W / 2 + 100, H / 2]);
    if (!a || !b) return;
    const kmPer100 = d3.geoDistance(a, b) * 6371;
    if (!(kmPer100 > 0)) return;
    const want = (W / 6) / 100 * kmPer100;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200];
    const km = steps.reduce((p, q) => Math.abs(q - want) < Math.abs(p - want) ? q : p, steps[0]);
    const len = km / kmPer100 * 100;
    const bx = W - PAD - len, by = H - PAD - 6;
    const g = d3.select("#gScale").selectAll("g.scalebar").data([0])
      .join(enter => {
        const gg = enter.append("g").attr("class", "scalebar");
        gg.append("path");
        gg.append("text").attr("text-anchor", "end");
        return gg;
      });
    g.select("path").attr("d", "M" + bx + "," + (by - 4) + "V" + by + "H" + (bx + len) +
      "V" + (by - 4) + "M" + (bx + len / 2) + "," + by + "v-2.6");
    g.select("text").attr("x", bx + len).attr("y", by - 7).text(km + " km");
  }

  // ── page ───────────────────────────────────────────────────────────────────
  function render() {
    if (s.mapError) $("mapCaption").textContent = "Hranice se nepodařilo načíst";
    else if (!s.districts.length) $("mapCaption").textContent = "Načítám hranice…";
    else if (s.level === "regions") {
      const n = s.regions.filter(r => mMiss(r.id)).length;
      $("mapCaption").textContent = "Kraje · " + n + " ze " + s.regions.length + " má co doplnit";
    } else {
      const n = s.districts.filter(u => missCount(u.id)).length;
      $("mapCaption").textContent = "Okresy · " + n + " ze " + s.districts.length + " má co doplnit";
    }
    document.querySelectorAll("#levels button").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.level === s.level)));
    drawMap();
    renderPanel();
    renderTotals();
    syncState();
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function renderPanel() {
    const host = $("analysis");
    host.innerHTML = "";
    const unit = s.selected
      ? (s.level === "regions" ? s.regions : s.districts).find(u => u.id === s.selected)
      : null;
    if (!unit) {
      $("aName").textContent = s.level === "regions" ? "Vyber kraj" : "Vyber okres";
      $("aMeta").textContent = "Klikni do mapy.";
      return;
    }
    if (s.level === "regions") { renderMatrix(host, unit); return; }
    renderOkres(host, unit);
  }

  // Foot of the page: how many okresů have each single item, over all 77.
  function renderTotals() {
    const host = $("totals");
    if (!host) return;
    const all = s.districts.length;
    if (!all) { host.innerHTML = ""; return; }
    host.innerHTML = "";
    GROUPS.forEach(g => {
      const box = el("section", "tbox");
      box.appendChild(el("div", "th", g.label));
      g.opts.forEach(v => {
        const n = s.districts.filter(u => has(u.id, g.key, v)).length;
        const row = el("div", "trow" + (n === all ? " full" : ""));
        if (g.key === "types") {
          const im = document.createElement("img");
          im.src = icon(v); im.alt = "";
          row.appendChild(im);
        } else {
          row.appendChild(el("span", "sp"));
        }
        row.appendChild(el("span", "l", g.text(v)));
        const bar = el("span", "b");
        const fill = el("i");
        fill.style.width = (n / all) * 100 + "%";
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el("span", "n", n + "/" + all));
        row.appendChild(el("span", "p", pct(n, all)));
        box.appendChild(row);
      });
      host.appendChild(box);
    });
  }

  function renderOkres(host, u) {
    const r = regionOf(u.parent);
    const miss = missCount(u.id);
    $("aName").textContent = u.name;
    $("aMeta").textContent = (r ? r.name + " · " : "") +
      (33 - miss) + " z 33 · " + pct(33 - miss, 33);
    GROUPS.forEach(g => {
      const box = el("section", "gbox");
      const head = el("div", "gh");
      head.appendChild(el("span", "gt", g.label));
      const mis = missing(u.id, g);
      head.appendChild(el("span", "gn", (g.n - mis.length) + " / " + g.n));
      box.appendChild(head);

      const wantRow = el("div", "want");
      if (!mis.length) wantRow.appendChild(el("span", "done", "Hotovo"));
      mis.forEach(v => wantRow.appendChild(chip(u.id, g, v, true)));
      box.appendChild(wantRow);

      const gotv = g.opts.filter(v => has(u.id, g.key, v));
      if (gotv.length) {
        const got = el("div", "got");
        gotv.forEach(v => got.appendChild(chip(u.id, g, v, false)));
        box.appendChild(got);
      }
      host.appendChild(box);
    });
  }

  function chip(id, g, v, isMissing) {
    const b = el("button", isMissing ? "chip want" : "chip got");
    b.type = "button";
    if (g.key === "types") {
      const im = document.createElement("img");
      im.src = icon(v);
      im.alt = "";
      b.appendChild(im);
    }
    b.appendChild(el("span", null, g.text(v)));
    b.title = (isMissing ? "Označit jako nalezené: " : "Zrušit: ") + g.text(v);
    b.onclick = () => toggle(id, g.key, v);
    return b;
  }

  function renderMatrix(host, r) {
    const miss = mMiss(r.id);
    $("aName").textContent = r.name;
    $("aMeta").textContent = "matrix " + (81 - miss) + " z 81 · " + pct(81 - miss, 81);
    const box = el("section", "gbox wide");
    const head = el("div", "gh");
    head.appendChild(el("span", "gt", "Matrix 9 × 9 · obtížnost / terén"));
    head.appendChild(el("span", "gn", (81 - miss) + " / 81"));
    box.appendChild(head);

    const grid = el("div", "matrix");
    grid.appendChild(el("span", "mc", ""));
    STEPS.forEach(t => grid.appendChild(el("span", "mc", "T" + num(t))));
    STEPS.forEach(d => {
      grid.appendChild(el("span", "mc", "D" + num(d)));
      STEPS.forEach(t => {
        const b = el("button", "mcell" + (mHas(r.id, d, t) ? " on" : ""));
        b.type = "button";
        b.title = "D" + num(d) + " / T" + num(t);
        b.onclick = () => toggleCell(r.id, d, t);
        grid.appendChild(b);
      });
    });
    box.appendChild(grid);
    host.appendChild(box);
  }

  function setLevel(lvl) {
    if (s.level === lvl) return;
    s.level = lvl;
    s.selected = null;
    render();
  }
  function select(id) { s.selected = s.selected === id ? null : id; render(); }

  function persist() {
    s.data.updated = new Date().toISOString();
    s.dirty = true;
    try { localStorage.setItem(LS_DATA, JSON.stringify(s.data)); } catch (e) {}
    render();
  }

  function toggle(id, key, val) {
    const r = s.data.districts[id] || (s.data.districts[id] = {});
    const arr = r[key] || (r[key] = []);
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    if (GROUPS.every(g => !(r[g.key] || []).length)) delete s.data.districts[id];
    persist();
  }

  function toggleCell(id, d, t) {
    const r = s.data.regions[id] || (s.data.regions[id] = {});
    const arr = r.matrix || (r.matrix = []);
    const k = cell(d, t);
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    if (!arr.length) delete s.data.regions[id];
    persist();
  }

  function syncState() {
    const when = s.data.updated
      ? new Date(s.data.updated).toLocaleDateString("cs-CZ", { year: "numeric", month: "short", day: "numeric" })
      : "–";
    $("stamp").textContent = "Poslední změna: " + when;
    if (s.fetchError) { $("syncState").textContent = s.fetchError; return; }
    $("syncState").textContent = s.dirty ? "Neuložené změny v tomto prohlížeči." : "Uloženo · " + when;
  }

  // ── data ───────────────────────────────────────────────────────────────────
  const shape = o => ({ updated: o.updated || null, regions: o.regions || {}, districts: o.districts || {} });

  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_DATA) || "null"); } catch (e) {}
    if (local && local.districts) { s.data = shape(local); render(); }
    let remote = null;
    try {
      const r = await fetch(DATA_PATH, { cache: "no-store" });
      if (r.ok) remote = await r.json();
      else s.fetchError = "Nepodařilo se přečíst " + DATA_PATH + " (" + r.status + ").";
    } catch (e) { s.fetchError = "Nepodařilo se načíst " + DATA_PATH + "."; }
    if (remote && remote.districts) {
      const rt = Date.parse(remote.updated || 0) || 0;
      const lt = local ? (Date.parse(local.updated || 0) || 0) : -1;
      if (rt >= lt) { s.data = shape(remote); s.dirty = false; }
      else s.dirty = true;
    }
    render();
  }

  const b64 = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));

  async function push(token) {
    const g = CFG.github;
    const api = "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" + DATA_PATH;
    const head = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    let sha = null;
    const cur = await fetch(api + "?ref=" + g.branch, { headers: head });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status === 401) throw new Error("Token odmítnut. Zkontroluj, že je vložený celý a nevypršel.");
    else if (cur.status === 403) throw new Error("Token nemá práva. Potřebuje Contents: Read and write.");
    else if (cur.status !== 404) throw new Error("Soubor nelze přečíst (" + cur.status + ").");
    const body = {
      message: "Update geocaching record (" + Object.keys(s.data.districts).length + " districts)",
      content: b64(JSON.stringify(s.data, null, 2) + "\n"),
      branch: g.branch
    };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
    if (!put.ok) throw new Error("Uložení selhalo (" + put.status + ").");
  }

  async function doSave(token) {
    const btn = $("saveBtn");
    btn.disabled = true; btn.textContent = "Ukládám…";
    try {
      await push(token);
      s.dirty = false;
      btn.textContent = "Uloženo";
      setTimeout(() => { btn.textContent = "Uložit"; btn.disabled = false; }, 1400);
      syncState();
    } catch (e) {
      localStorage.removeItem(LS_TOKEN);
      btn.textContent = "Uložit"; btn.disabled = false;
      $("syncState").textContent = e.message;
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
    if (!tk) { $("tokErr").textContent = "Token chybí."; return; }
    $("tokenDlg").close();
    localStorage.setItem(LS_TOKEN, tk);
    doSave(tk);
  };
  $("dlBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s.data, null, 2) + "\n"], { type: "application/json" }));
    a.download = "geocaching.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.querySelectorAll("#levels button").forEach(b => {
    b.onclick = () => setLevel(b.dataset.level);
  });

  // ── gate ───────────────────────────────────────────────────────────────────
  async function sha256(str) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function start() {
    $("gate").hidden = true;
    $("gate").style.display = "none";
    loadGeometry().then(render).catch(() => { s.mapError = true; render(); });
    load();
  }

  $("gateGo").onclick = async () => {
    if ((await sha256($("gatePw").value)) !== CFG.gcPasswordHash) {
      $("gateErr").textContent = "Nesprávné heslo.";
      return;
    }
    sessionStorage.setItem(SS, "1");
    start();
  };
  $("gatePw").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("gateGo").click(); } };

  if (sessionStorage.getItem(SS) === "1") start();
  else $("gatePw").focus();
})();
