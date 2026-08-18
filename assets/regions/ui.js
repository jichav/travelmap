// Everything that paints the page around the map: stats, tabs, lists, detail panel.
(function (R) {
  "use strict";
  const s = R.s, $ = R.$, t = R.t;
  const nameOf = u => R.nameOf(u), byName = (p, q) => R.byName(p, q);

  R.render = function () {
    const c = R.country();
    const vReg = s.regions.filter(u => R.isVisited(u.id)).length;
    const vDis = s.districts.filter(u => R.isVisited(u.id)).length;
    const nReg = s.regions.length || c.regions, nDis = s.districts.length || c.districts;
    const pct = s.level === "regions"
      ? (nReg ? (vReg / nReg) * 100 : 0)
      : (nDis ? (vDis / nDis) * 100 : 0);

    $("scopeLabel").textContent = s.lang === "cs" ? c.of.cs : c.of.en;
    $("pct").innerHTML = (pct > 0 && pct < 10 ? pct.toFixed(1) : Math.round(pct)) + "<small>%</small>";
    $("cntReg").innerHTML = vReg + "<small> / " + nReg + "</small>";
    $("cntDis").innerHTML = vDis + "<small> / " + nDis + "</small>";
    $("pctBar").style.width = pct + "%";
    $("regBar").style.width = (nReg ? (vReg / nReg) * 100 : 0) + "%";
    $("disBar").style.width = (nDis ? (vDis / nDis) * 100 : 0) + "%";

    document.querySelectorAll("#levelSeg button").forEach(b => {
      const on = b.dataset.level === s.level;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });

    renderCountryTabs();
    renderRegionTabs();

    $("mapCaption").textContent = s.focus
      ? nameOf(R.regionOf(s.focus))
      : R.countryName(c);
    $("clearBtn").hidden = !s.selected;
    $("gcBtn").hidden = s.country !== "CZ";
    $("pwChangeBtn").hidden = !s.editing;
    $("dataPanel").hidden = !s.editing;

    if (s.mapError) $("mapCaption").textContent = t("mapFailed");
    else if (!s.regions.length) $("mapCaption").textContent = t("loadingMap");

    R.drawMap();
    $("seatLegendRow").hidden = !s.seatShown;
    $("seatLegendText").textContent = t(c.seatKey || "seatKraj");
    R.buildDownloads();
    renderList();
    renderDetail();
    R.syncState();
  };

  function renderCountryTabs() {
    const host = $("countryTabs");
    if (!host.childElementCount) {
      window.REGION_COUNTRIES.forEach(c => {
        const b = document.createElement("button");
        b.className = "tab";
        b.setAttribute("role", "tab");
        b.dataset.country = c.id;
        b.innerHTML = '<span class="fl"><img alt=""></span>' +
          '<span class="tx"><span class="n"></span><span class="c"></span></span>';
        b.querySelector("img").src = c.flag;
        b.onclick = () => R.setCountry(c.id);
        host.appendChild(b);
      });
    }
    host.querySelectorAll("button").forEach(b => {
      const c = R.country(b.dataset.country);
      b.setAttribute("aria-selected", String(c.id === s.country));
      b.querySelector(".n").textContent = R.countryName(c);
      b.querySelector(".c").textContent = c.regions + " / " + c.districts;
    });
  }

  function renderRegionTabs() {
    const host = $("regionTabs");
    host.hidden = s.level !== "districts";
    host.innerHTML = "";
    if (s.level !== "districts") return;
    const mk = (label, count, id) => {
      const b = document.createElement("button");
      b.className = "tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(s.focus === id));
      b.innerHTML = '<span class="n"></span><span class="c"></span>';
      b.querySelector(".n").textContent = label;
      b.querySelector(".c").textContent = count;
      b.onclick = () => { s.focus = id; s.selected = null; R.render(); };
      host.appendChild(b);
    };
    const vAll = R.units().filter(u => R.isVisited(u.id)).length;
    mk(t("wholeCountry"), vAll + " " + t("of") + " " + R.units().length, null);
    s.regions.slice().sort(byName).forEach(r => {
      const kids = s.districts.filter(d => d.parent === r.id);
      mk(nameOf(r), kids.filter(d => R.isVisited(d.id)).length + " " + t("of") + " " + kids.length, r.id);
    });
  }

  function renderList() {
    const host = $("lists");
    host.innerHTML = "";
    const list = R.units().filter(R.inFocus);
    $("listTitle").textContent = s.level === "regions" ? t("listRegions") : t("listDistricts");
    $("listCount").textContent = t("visitedOf", {
      a: list.filter(u => R.isVisited(u.id)).length, b: list.length
    });

    const tile = u => {
      const r = R.rec(u.id);
      const b = document.createElement("button");
      b.className = "tile" + (r ? " on" : "") + (u.id === s.selected ? " sel" : "");
      b.innerHTML = '<span class="lbl"><span class="t"></span></span><span class="y"></span>';
      b.querySelector(".t").textContent = nameOf(u);
      const y = b.querySelector(".y");
      if (s.editing) {
        // Editing marks visits straight from the list; the tile itself still selects.
        const chk = document.createElement("span");
        chk.className = "chk";
        chk.setAttribute("role", "checkbox");
        chk.setAttribute("aria-checked", String(!!r));
        chk.setAttribute("aria-label", t("visited"));
        chk.tabIndex = 0;
        chk.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
          '<path d="m3 8.4 3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        const flip = ev => { ev.preventDefault(); ev.stopPropagation(); R.toggle(u.id); };
        chk.onclick = flip;
        chk.onkeydown = ev => { if (ev.key === " " || ev.key === "Enter") flip(ev); };
        y.appendChild(chk);
      } else if (r) {
        const sp = document.createElement("span");
        sp.textContent = t("visitedShort");
        y.appendChild(sp);
      }
      b.onclick = () => R.select(u.id);
      return b;
    };

    if (s.level === "regions" || s.focus) {
      const grid = document.createElement("div");
      grid.className = "grid";
      list.slice().sort(byName).forEach(u => grid.appendChild(tile(u)));
      host.appendChild(grid);
      return;
    }

    // Whole country, districts: grouped under their kraj.
    s.regions.slice().sort(byName).forEach(r => {
      const kids = s.districts.filter(d => d.parent === r.id).sort(byName);
      if (!kids.length) return;
      const h = document.createElement("h4");
      h.className = "grouphead";
      h.innerHTML = '<span class="sw"></span><span class="gl"></span><span class="gc"></span>';
      h.querySelector(".gl").textContent = nameOf(r);
      h.querySelector(".gc").textContent =
        kids.filter(d => R.isVisited(d.id)).length + " " + t("of") + " " + kids.length;
      host.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "grid";
      kids.forEach(u => grid.appendChild(tile(u)));
      host.appendChild(grid);
    });
  }

  function renderDetail() {
    const u = s.selected ? R.byId(s.selected) : null;
    $("detailPanel").hidden = !u;
    if (!u) return;
    const r = R.rec(u.id);
    $("dName").textContent = nameOf(u);
    const kind = u.level === "regions" ? t("kindRegion") : t("kindDistrict");
    const extra = u.level === "regions"
      ? t("districtsCount", { n: s.districts.filter(d => d.parent === u.id).length })
      : (R.regionOf(u.parent) ? t("inRegion", { name: nameOf(R.regionOf(u.parent)) }) : "");
    $("dMeta").textContent = extra ? kind + " · " + extra : kind;
    $("fVisited").setAttribute("aria-checked", String(!!r));
    $("fVisited").disabled = !s.editing;
    $("dHint").hidden = s.editing;
  }

  R.select = function (id) { if (!id) return; s.selected = id; R.render(); };

  R.toggle = function (id) {
    if (!s.editing || !id) return;
    if (R.isVisited(id)) delete s.data.places[id];
    else s.data.places[id] = {};
    R.touch();
  };

  // ── editing controls ───────────────────────────────────────────────────────
  $("fVisited").onclick = () => R.toggle(s.selected);
  $("clearBtn").onclick = () => { s.selected = null; R.render(); };

  // The geocaching record lives on its own page, behind its own password.
  async function sha256(str) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  $("gcBtn").onclick = () => {
    $("gcErr").textContent = ""; $("gcPw").value = "";
    $("gcDlg").showModal(); $("gcPw").focus();
  };
  $("gcCancel").onclick = () => $("gcDlg").close();
  $("gcPw").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("gcGo").click(); } };
  $("gcGo").onclick = async () => {
    if ((await sha256($("gcPw").value)) !== R.CFG.gcPasswordHash) {
      $("gcErr").textContent = t("badPassword"); return;
    }
    sessionStorage.setItem("travelmap.gc.v1", "1");
    location.href = "geocaching.html";
  };

  document.querySelectorAll("#levelSeg button").forEach(b => {
    b.onclick = () => { s.level = b.dataset.level; s.selected = null; R.render(); };
  });
})(window.R);
