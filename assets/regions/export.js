// GeoJSON and raw-JSON downloads.
(function (R) {
  "use strict";
  const s = R.s, $ = R.$, t = R.t;

  function geojsonFor(lvl, parentId) {
    const list = (lvl === "regions" ? s.regions : s.districts)
      .filter(u => !parentId || u.parent === parentId || u.id === parentId)
      .slice().sort((p, q) => p.name.localeCompare(q.name));
    return {
      type: "FeatureCollection",
      name: "travelmap_" + (parentId ? parentId.toLowerCase() + "_" : "") + lvl,
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: list.map(u => ({
        type: "Feature",
        properties: {
          name: u.name,
          name_cs: u.nameCs,
          id: u.id,
          level: u.level === "regions" ? "region" : "district",
          region: u.parent ? (R.regionOf(u.parent) ? R.regionOf(u.parent).name : u.parent) : u.name,
          seat: u.seat ? u.seat.name : null,
          visited: R.isVisited(u.id) ? "yes" : "no"
        },
        geometry: u.f.geometry
      }))
    };
  }

  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  R.buildDownloads = function () {
    const grid = $("dlgrid");
    if (!grid) return;
    grid.innerHTML = "";
    const add = (label, file, gj) => {
      const b = document.createElement("button");
      b.className = "dlbtn";
      b.innerHTML = '<span class="s"></span><span class="f">GeoJSON</span>';
      b.querySelector(".s").textContent = label;
      b.onclick = () => {
        const j = gj();
        if (!j.features.length) { b.querySelector(".f").textContent = t("noData"); return; }
        download(file, JSON.stringify(j), "application/geo+json");
      };
      grid.appendChild(b);
    };
    const cc = s.country.toLowerCase();
    add(t("dlRegions"), "travelmap_" + cc + "_regions.geojson", () => geojsonFor("regions", null));
    add(t("dlDistricts"), "travelmap_" + cc + "_districts.geojson", () => geojsonFor("districts", null));
    if (s.focus) {
      const r = R.regionOf(s.focus);
      if (r) add(t("dlDistrictsIn", { name: R.nameOf(r) }),
        "travelmap_" + r.id.toLowerCase() + "_districts.geojson", () => geojsonFor("districts", s.focus));
    }
  };

  R.bindExport = function () {
    const eb = $("exportBtn");
    if (eb) eb.onclick = () => download("regions.json", JSON.stringify(s.data, null, 2) + "\n", "application/json");
    if (s.regions.length) R.buildDownloads();
  };
})(window.R);
