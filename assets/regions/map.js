// The SVG map: projection, framing, unit paths, kraj mesh, seat dots.
(function (R) {
  "use strict";
  const s = R.s, $ = R.$;

  const W = 900, PAD = 20, H_CAP = 700, H_MIN = 340;
  let H = 560;

  const projection = () => {
    const V = R.country().view;
    const p = V.type === "transverseMercator" ? d3.geoTransverseMercator()
      : V.type === "azimuthalEqualArea" ? d3.geoAzimuthalEqualArea()
      : d3.geoConicConformal();
    p.rotate(V.rotate);
    if (V.parallels && p.parallels) p.parallels(V.parallels);
    if (V.center) p.center(V.center);
    return p;
  };

  function frameFeature() {
    const list = s.focus ? [R.regionOf(s.focus)].filter(Boolean) : s.regions;
    return { type: "FeatureCollection", features: list.map(u => u.f) };
  }

  R.drawMap = function () {
    if (!s.regions.length) return;
    const f = frameFeature();
    const inner = W - 2 * PAD;
    const test = projection().fitExtent([[0, 0], [inner, inner]], f);
    const bn = d3.geoPath(test).bounds(f);
    const w = bn[1][0] - bn[0][0], hh = bn[1][1] - bn[0][1];
    let ratio = (w > 0 && hh > 0) ? hh / w : 0.62;
    ratio = Math.max((H_MIN - 2 * PAD) / inner, Math.min((H_CAP - 2 * PAD) / inner, ratio));
    H = Math.round(inner * ratio + 2 * PAD);
    d3.select("#map").attr("viewBox", "0 0 " + W + " " + H);

    const proj = projection().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], f);
    const path = d3.geoPath(proj);
    $("projLabel").textContent = R.country().view.label || "";

    d3.select("#gWorld").selectAll("path").data(s.world || [], (d, i) => i)
      .join("path").attr("class", "c-out").attr("d", path);

    const list = R.units();
    d3.select("#gUnits").selectAll("path").data(list, u => u.id)
      .join(enter => { const p = enter.append("path"); p.append("title"); return p; })
      .attr("d", u => path(u.f))
      .attr("class", u => {
        let cls = "c-in";
        if (R.isVisited(u.id)) cls += " visited";
        if (!R.inFocus(u)) cls += " dim";
        if (u.id === s.selected) cls += " sel";
        return cls;
      })
      .on("click", (ev, u) => R.select(u.id))
      .select("title").text(u => R.nameOf(u));

    // Kraj and state boundaries: the same line as the okres boundaries, only thicker, so
    // the hierarchy reads without introducing a second colour. Each arc is drawn in the
    // colour of the units it separates – white against a visited fill, grey against an
    // unvisited one.
    const vis = g => R.isVisited(s.level === "regions" ? g.properties.tmParent : g.properties.tmId);
    const strong = (a, b) => a === b
      || (s.level === "districts" && a.properties.tmParent !== b.properties.tmParent);
    const tp = s.topo, obj = tp && tp.objects.d;
    const meshes = obj ? [
      { cls: "u-edge grey", m: topojson.mesh(tp, obj, (a, b) => strong(a, b) && !vis(a) && !vis(b)) },
      { cls: "u-edge white", m: topojson.mesh(tp, obj, (a, b) => strong(a, b) && (vis(a) || vis(b))) }
    ] : [];
    d3.select("#gEdge").selectAll("path").data(meshes, m => m.cls)
      .join("path").attr("class", m => m.cls).attr("d", m => path(m.m));

    const sel = s.selected ? list.find(u => u.id === s.selected) : null;
    d3.select("#gSel").selectAll("path").data(sel ? [sel] : [], u => u.id)
      .join("path").attr("class", "c-sel").attr("d", u => path(u.f));

    // Seats: kraj capitals only. A whole country's worth of okres towns is unreadable, and
    // on a zoomed map the okres names already sit in the list beside it.
    const seated = s.level === "regions" ? list.filter(u => u.seat && R.inFocus(u)) : [];
    const named = true;
    s.seatShown = seated.length;
    d3.select("#gSeats").selectAll("g.seatg").data(seated, u => u.id)
      .join(enter => {
        const g = enter.append("g").attr("class", "seatg");
        g.append("circle").attr("class", "seat");
        g.append("text").attr("class", "seat-label");
        return g;
      })
      .call(g => {
        g.select("circle.seat")
          .attr("cx", u => proj(u.seat.ll)[0]).attr("cy", u => proj(u.seat.ll)[1])
          .attr("r", named ? 2.6 : 1.9);
        g.select("text.seat-label")
          .attr("x", u => proj(u.seat.ll)[0]).attr("y", u => proj(u.seat.ll)[1] - 5)
          .attr("opacity", named ? 1 : 0)
          .text(u => u.seat.name);
      });

    scaleBar(proj);
  };

  // A plain graphic scale in the bottom right corner: the round distance closest to a
  // sixth of the map width, measured along the middle of the frame.
  function scaleBar(proj) {
    const y = H / 2, x0 = W / 2;
    const inv = proj.invert;
    if (!inv) return;
    const a = inv([x0, y]), b = inv([x0 + 100, y]);
    if (!a || !b) return;
    const kmPer100 = d3.geoDistance(a, b) * 6371;
    if (!(kmPer100 > 0)) return;
    const want = (W / 6) / 100 * kmPer100;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200, 300, 500, 1000];
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
})(window.R);
