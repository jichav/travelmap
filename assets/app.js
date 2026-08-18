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
      ? new Date(data.updated).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "—";
    $("stamp").textContent = "Last change " + when;
    if (fetchError) { el.textContent = fetchError + " Showing what is stored in this browser."; return; }
    if (!editing) { el.textContent = "Last change " + when + "."; return; }
    el.textContent = dirty
      ? "Unsaved changes in this browser. Save to publish them everywhere."
      : "In sync with the repository.";
  }

  // ── map ────────────────────────────────────────────────────────────────────
  const W = 900, PAD = 22;
  let H = 640;

  const mercY = deg => Math.log(Math.tan(Math.PI / 4 + deg * Math.PI / 360));

  // Canvas height follows the view box, and when a region would be taller than the cap the
  // view box widens instead — so the frame is always filled edge to edge, never letterboxed.
  const H_CAP = 780;
  function fitView(bbox) {
    const inner = W - 2 * PAD;
    const dy = mercY(bbox[1][1]) - mercY(bbox[0][1]);
    let dx = (bbox[1][0] - bbox[0][0]) * Math.PI / 180;
    let b = [[bbox[0][0], bbox[0][1]], [bbox[1][0], bbox[1][1]]];
    let h = inner * dy / dx + 2 * PAD;
    if (h > H_CAP) {
      const target = dy * inner / (H_CAP - 2 * PAD);
      const add = (target - dx) * 90 / Math.PI;
      b[0][0] -= add; b[1][0] += add;
      h = H_CAP;
    }
    return { bbox: b, h: Math.round(Math.max(400, h)) };
  }

  // Sampled outline of the view box. Points (not a polygon) so d3 measures the exact
  // projected extent — a near-global polygon would be mangled by antimeridian clipping.
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
    const fit = fitView(view.bbox);
    H = fit.h;
    d3.select("#map").attr("viewBox", "0 0 " + W + " " + H);
    const proj = d3.geoMercator()
      .rotate(view.rotate || [0, 0])
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], bboxFeature(fit.bbox));
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
    $("scopeLabel").textContent = scope === "World" ? "of the world" : "of " + scope;
    $("pct").innerHTML = (s.pct > 0 && s.pct < 10 ? s.pct.toFixed(1) : Math.round(s.pct)) + "<small>%</small>";
    $("cnt").innerHTML = s.visitedStates + "<small> / " + s.states + "</small>";
    $("caps").innerHTML = s.capStates + "<small> / " + s.states + "</small>";
    $("pctBar").style.width = s.pct + "%";
    $("cntBar").style.width = s.pct + "%";
    $("capsBar").style.width = (s.states ? (s.capStates / s.states) * 100 : 0) + "%";

    const tabs = $("tabs");
    tabs.innerHTML = "";
    SCOPES.forEach(name => {
      const t = stats(name);
      const lk = !t.unlocked && !editing;
      const b = document.createElement("button");
      b.className = "tab" + (lk ? " lk" : "") + (name === "World" ? " world" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(name === scope));
      b.innerHTML = '<span class="n"></span><span class="c"></span>';
      b.querySelector(".n").textContent = name;
      b.querySelector(".c").textContent = lk ? "Locked" : t.visitedStates + " of " + t.states;
      b.onclick = () => { scope = name; selected = null; render(); };
      tabs.appendChild(b);
    });

    const locked = !s.unlocked && !editing;
    $("mapCaption").textContent = scope;
    $("lockveil").hidden = !locked;
    $("lockTitle").textContent = scope + " is still closed";
    $("lockText").textContent = "It opens the moment one place here is marked as visited.";
    $("clearBtn").hidden = !selected;
    $("pwChangeBtn").hidden = !editing;

    drawMap();
    renderList(locked);
    renderDetail();
    syncState();
  }

  const GROUPS = [
    { kind: "state", label: "Countries" },
    { kind: "partial", label: "Partially recognised states" },
    { kind: "territory", label: "Territories" }
  ];

  function renderList(locked) {
    const s = stats(scope);
    $("listTitle").textContent = scope;
    $("listCount").textContent = locked
      ? "Locked — " + s.places + " places waiting"
      : s.visitedStates + " of " + s.states + " countries visited";
    const host = $("lists");
    host.innerHTML = "";
    if (locked) return;

    GROUPS.forEach(g => {
      const items = inScope(scope).filter(c => c.kind === g.kind);
      if (!items.length) return;
      const h = document.createElement("h4");
      h.className = "grouphead";
      h.innerHTML = '<span class="sw ' + g.kind + '"></span><span class="gl"></span><span class="gc"></span>';
      h.querySelector(".gl").textContent = g.label;
      const gv = items.filter(c => isVisited(c.id)).length;
      h.querySelector(".gc").textContent = gv + " of " + items.length;
      host.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "grid";
      items.forEach(c => {
        const r = rec(c.id);
        const b = document.createElement("button");
        b.className = "tile k-" + c.kind + (r ? " on" : "") + (c.id === selected ? " sel" : "");
        b.innerHTML = '<span class="t"></span><span class="y"></span>';
        b.querySelector(".t").textContent = c.name;
        const y = b.querySelector(".y");
        if (r) {
          const txt = document.createElement("span");
          txt.textContent = r.year ? String(r.year) : "visited";
          y.appendChild(txt);
          if (r.capital) { const d = document.createElement("span"); d.className = "dot"; d.title = "Capital seen"; y.appendChild(d); }
        }
        b.onclick = () => select(c.id);
        grid.appendChild(b);
      });
      host.appendChild(grid);
    });
  }

  const KIND_LABEL = { state: "Country", partial: "Partially recognised state", territory: "Territory" };

  function renderDetail() {
    const c = selected ? BY_ID.get(selected) : null;
    $("detailPanel").hidden = !c;
    if (!c) return;
    const r = rec(c.id);
    $("dName").textContent = c.name;
    $("dMeta").textContent = KIND_LABEL[c.kind] + " · " + c.capital;
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

  function setEditing(on) {
    editing = on;
    $("mode").textContent = on ? "Editing" : "Reading";
    $("mode").classList.toggle("live", on);
    $("unlockBtn").textContent = on ? "Sign out" : "Sign in";
    $("saveBtn").hidden = !on;
    render();
  }

  $("unlockBtn").onclick = () => {
    if (editing) { sessionStorage.removeItem(SS_SESSION); setEditing(false); return; }
    $("pwErr").textContent = ""; $("pw").value = "";
    $("loginDlg").showModal(); $("pw").focus();
  };
  $("loginCancel").onclick = () => $("loginDlg").close();
  $("pw").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("loginGo").click(); } };
  $("loginGo").onclick = async () => {
    if ((await sha256($("pw").value)) !== CFG.passwordHash) { $("pwErr").textContent = "That password does not match."; return; }
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
    else if (cur.status !== 404) throw new Error("Cannot read the file (" + cur.status + ").");
    const body = {
      message: "Update travel record (" + visitedIds().length + " places)",
      content: b64(JSON.stringify(data, null, 2) + "\n"),
      branch: g.branch
    };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
    if (!put.ok) throw new Error("Save failed (" + put.status + "). " + (await put.text()).slice(0, 120));
  }

  $("saveBtn").onclick = () => {
    const t = localStorage.getItem(LS_TOKEN);
    if (t) { doSave(t); return; }
    $("tokErr").textContent = ""; $("tok").value = "";
    $("tokenDlg").showModal(); $("tok").focus();
  };
  $("tokCancel").onclick = () => $("tokenDlg").close();
  $("tokGo").onclick = () => {
    const t = $("tok").value.trim();
    if (!t) { $("tokErr").textContent = "Paste a token first."; return; }
    $("tokenDlg").close();
    localStorage.setItem(LS_TOKEN, t);
    doSave(t);
  };

  async function doSave(token) {
    const btn = $("saveBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await pushToGitHub(token);
      dirty = false;
      btn.textContent = "Saved";
      setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1400);
      syncState();
    } catch (e) {
      localStorage.removeItem(LS_TOKEN);
      btn.textContent = "Save"; btn.disabled = false;
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

  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "travel.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── boot ───────────────────────────────────────────────────────────────────
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")
    .then(topo => {
      world = topojson.feature(topo, topo.objects.countries).features;
      world.forEach(f => { const k = featureKey(f); if (k) haveGeom.add(k); });
      render();
    })
    .catch(() => { $("mapCaption").textContent = scope + " — map data unavailable"; });

  if (sessionStorage.getItem(SS_SESSION) === "1") setEditing(true);
  load();
})();
