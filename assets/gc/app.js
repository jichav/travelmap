// Geocaching page: Czech okresy only, with the found types, sizes, terrain and difficulty
// ticked per okres. Geometry is loaded the same way as on the regions page; the record
// lives in data/geocaching.json and is pushed back with a token the user pastes.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const CFG = window.CONFIG;
  const SS = "travelmap.gc.v1";
  const LS_DATA = "travelmap.geocaching.v1";
  const LS_TOKEN = "travelmap.token.v1";
  const DATA_PATH = (CFG.github && CFG.github.gcPath) || "data/geocaching.json";

  const GROUPS = [
    { key: "types", label: "Typ keše",
      opts: ["Tradiční", "Multi", "Mystery", "Letterbox", "Earthcache", "Wherigo", "Virtuální", "Event"] },
    { key: "sizes", label: "Velikost",
      opts: ["Micro", "Small", "Regular", "Large", "Neurčeno"] },
    { key: "terrain", label: "Terén", nums: true,
      opts: ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"] },
    { key: "diff", label: "Obtížnost", nums: true,
      opts: ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"] }
  ];

  const s = {
    data: { updated: null, districts: {} },
    districts: [], regions: [], topo: null, world: null,
    selected: null, dirty: false, fetchError: null, mapError: false
  };

  const rec = id => s.data.districts[id] || null;
  const ticks = id => { const r = rec(id); return r ? GROUPS.reduce((n, g) => n + ((r[g.key] || []).length), 0) : 0; };
  const has = (id, key, val) => { const r = rec(id); return !!r && (r[key] || []).indexOf(val) >= 0; };
  const byName = (p, q) => p.name.localeCompare(q.name, "cs");
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
      return { id: id, name: f.properties.tmName, parent: f.properties.tmParent, f: f };
    });
    s.regions = Object.keys(window.CZ_REGIONS).map(cz => ({ id: window.CZ_REGIONS[cz].id, name: cz }));
    s.world = topojson.feature(topo, topo.objects.countries).features;
  }

  // ── map ────────────────────────────────────────────────────────────────────
  const W = 900, PAD = 20;
  let H = 560;

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
    const path = d3.geoPath(proj);

    d3.select("#gWorld").selectAll("path").data(s.world || [], (d, i) => i)
      .join("path").attr("class", "c-out").attr("d", path);

    d3.select("#gUnits").selectAll("path").data(s.districts, u => u.id)
      .join(enter => { const p = enter.append("path"); p.append("title"); return p; })
      .attr("d", u => path(u.f))
      .attr("class", u => {
        const n = ticks(u.id);
        return "c-in" + (n === 0 ? "" : n < 4 ? " t1" : n < 9 ? " t2" : " t3");
      })
      .on("click", (ev, u) => select(u.id))
      .select("title").text(u => u.name + (ticks(u.id) ? " · " + ticks(u.id) + " údajů" : ""));

    // Kraj boundaries: the okres line, twice as thick.
    const tp = s.topo, obj = tp && tp.objects.d;
    const mesh = obj ? [topojson.mesh(tp, obj, (a, b) =>
      a === b || a.properties.tmParent !== b.properties.tmParent)] : [];
    d3.select("#gEdge").selectAll("path").data(mesh)
      .join("path").attr("class", "u-edge").attr("d", path);

    const sel = s.selected ? s.districts.find(u => u.id === s.selected) : null;
    d3.select("#gSel").selectAll("path").data(sel ? [sel] : [], u => u.id)
      .join("path").attr("class", "c-sel").attr("d", u => path(u.f));

    scaleBar(proj);
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
    const nDis = s.districts.length || 77;
    const vDis = s.districts.filter(u => ticks(u.id)).length;
    const types = new Set(), sizes = new Set(), regs = new Set();
    Object.keys(s.data.districts).forEach(id => {
      const r = s.data.districts[id];
      (r.types || []).forEach(v => types.add(v));
      (r.sizes || []).forEach(v => sizes.add(v));
      const u = s.districts.find(d => d.id === id);
      if (u && u.parent && ticks(id)) regs.add(u.parent);
    });

    $("cntDis").innerHTML = vDis + "<small> / " + nDis + "</small>";
    $("disBar").style.width = (vDis / nDis) * 100 + "%";
    $("cntType").innerHTML = types.size + "<small> / 8</small>";
    $("typeBar").style.width = (types.size / 8) * 100 + "%";
    $("cntSize").innerHTML = sizes.size + "<small> / 5</small>";
    $("sizeBar").style.width = (sizes.size / 5) * 100 + "%";
    $("cntReg").innerHTML = regs.size + "<small> / 14</small>";
    $("regBar").style.width = (regs.size / 14) * 100 + "%";

    if (s.mapError) $("mapCaption").textContent = "Hranice se nepodařilo načíst";
    else if (!s.districts.length) $("mapCaption").textContent = "Načítám hranice…";
    else $("mapCaption").textContent = "Česko";

    drawMap();
    renderPanel();
    renderList();
    syncState();
  }

  function renderPanel() {
    const u = s.selected ? s.districts.find(d => d.id === s.selected) : null;
    const host = $("groups");
    if (!u) {
      $("dName").textContent = "Vyber okres";
      $("dMeta").textContent = "Klikni do mapy nebo do seznamu pod ní.";
      host.innerHTML = "";
      return;
    }
    const r = regionOf(u.parent);
    $("dName").textContent = u.name;
    $("dMeta").textContent = (r ? r.name : "") + " · " + ticks(u.id) + " údajů";
    host.innerHTML = "";
    GROUPS.forEach(g => {
      const box = document.createElement("div");
      box.className = "group";
      const h = document.createElement("div");
      h.className = "gh";
      h.textContent = g.label;
      box.appendChild(h);
      const opts = document.createElement("div");
      opts.className = "opts" + (g.nums ? " nums" : "");
      g.opts.forEach(v => {
        const b = document.createElement("button");
        b.className = "opt";
        b.type = "button";
        b.textContent = v;
        b.setAttribute("aria-pressed", String(has(u.id, g.key, v)));
        b.onclick = () => toggle(u.id, g.key, v);
        opts.appendChild(b);
      });
      box.appendChild(opts);
      host.appendChild(box);
    });
  }

  function renderList() {
    const host = $("lists");
    host.innerHTML = "";
    const total = s.districts.length;
    $("listCount").textContent = s.districts.filter(u => ticks(u.id)).length + " z " + total + " okresů se záznamem";
    s.regions.forEach(r => {
      const kids = s.districts.filter(d => d.parent === r.id).sort(byName);
      if (!kids.length) return;
      const h = document.createElement("h4");
      h.className = "grouphead";
      h.innerHTML = '<span class="sw"></span><span class="gl"></span><span class="gc"></span>';
      h.querySelector(".gl").textContent = r.name;
      h.querySelector(".gc").textContent = kids.filter(d => ticks(d.id)).length + " z " + kids.length;
      host.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "grid";
      kids.forEach(u => {
        const n = ticks(u.id);
        const b = document.createElement("button");
        b.className = "tile" + (n ? " on" : "") + (u.id === s.selected ? " sel" : "");
        b.innerHTML = '<span class="t"></span><span class="y"></span>';
        b.querySelector(".t").textContent = u.name;
        b.querySelector(".y").textContent = n ? n + " údajů" : "";
        b.onclick = () => select(u.id);
        grid.appendChild(b);
      });
      host.appendChild(grid);
    });
  }

  function select(id) { s.selected = id; render(); }

  function toggle(id, key, val) {
    const r = s.data.districts[id] || (s.data.districts[id] = {});
    const arr = r[key] || (r[key] = []);
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    // An okres with nothing ticked leaves no entry behind.
    if (GROUPS.every(g => !(r[g.key] || []).length)) delete s.data.districts[id];
    s.data.updated = new Date().toISOString();
    s.dirty = true;
    try { localStorage.setItem(LS_DATA, JSON.stringify(s.data)); } catch (e) {}
    render();
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
  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_DATA) || "null"); } catch (e) {}
    if (local && local.districts) { s.data = local; render(); }
    let remote = null;
    try {
      const r = await fetch(DATA_PATH, { cache: "no-store" });
      if (r.ok) remote = await r.json();
      else s.fetchError = "Nepodařilo se přečíst " + DATA_PATH + " (" + r.status + ").";
    } catch (e) { s.fetchError = "Nepodařilo se načíst " + DATA_PATH + "."; }
    if (remote && remote.districts) {
      const rt = Date.parse(remote.updated || 0) || 0;
      const lt = local ? (Date.parse(local.updated || 0) || 0) : -1;
      if (rt >= lt) { s.data = remote; s.dirty = false; }
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
