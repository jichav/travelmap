// Loading and preparing the geoBoundaries topology: winding fixes, kraj merge, seats.
// One country at a time; results are cached so switching tabs back is instant.
(function (R) {
  "use strict";
  const s = R.s;
  const cache = {};
  let worldPromise = null;

  const shapeName = f => (f.properties && f.properties.shapeName) || "";

  // geoBoundaries polygons are not wound the way GeoJSON requires. d3 reads a reversed
  // outer ring as "everything except this shape", which paints the whole hemisphere, so
  // every ring is rewound first: outer rings counter-clockwise, holes clockwise.
  const HALF = 2 * Math.PI;
  function rewindRings(rings) {
    return rings.map((ring, i) => {
      const big = d3.geoArea({ type: "Polygon", coordinates: [ring] }) > HALF;
      const wantBig = i > 0;
      return big === wantBig ? ring : ring.slice().reverse();
    });
  }
  function rewind(f) {
    const g = f.geometry;
    if (!g) return f;
    if (g.type === "Polygon") g.coordinates = rewindRings(g.coordinates);
    else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(rewindRings);
    return f;
  }

  // Seat of a unit, dropped when it lies outside its own boundary: the okresy ringing
  // Prague, Brno and Plzeň are run from cities that are not part of them.
  function seatAt(f, seat) {
    if (!seat || !d3.geoContains(f, seat.ll)) return null;
    return seat;
  }
  function czSeat(f, cityName) {
    const ll = (window.CZ_SEATS || {})[cityName];
    if (!ll) return null;
    return seatAt(f, { name: (window.CZ_SEAT_LABEL || {})[cityName] || cityName, ll: ll });
  }

  function world(country) {
    if (!worldPromise) worldPromise = d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json");
    // Every country as flat grey, the mapped one included: the world outline and the
    // geoBoundaries units are generalised differently, and leaving the country out shows
    // the card through the sliver between the two.
    return worldPromise.then(topo => topojson.feature(topo, topo.objects.countries).features);
  }

  // Czechia: okres → kraj from the hand-kept table, so the two okresy ringing Prague are
  // not misfiled by a geometric test.
  function czParents(feats) {
    feats.forEach(f => {
      const raw = shapeName(f);
      const nm = R.DNAMES[raw] || { cs: raw, en: raw };
      f.properties.tmName = nm;
      f.properties.tmParent = (window.CZ_DISTRICT_PARENT || {})[nm.cs] || null;
    });
  }

  // geoBoundaries serves some countries with mangled ADM2 names, so each boundary is
  // paired with the closest name from the canonical list: edit distance on the folded
  // strings, best pairs claimed first, so the matching stays one to one.
  function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = row;
    }
    return prev[b.length];
  }

  function repairNames(feats, canonical, strip) {
    const raw = feats.map(f => window.foldAscii(shapeName(f).replace(strip, "")).trim());
    const cand = canonical.map(n => window.foldAscii(n));
    const pairs = [];
    raw.forEach((r, i) => cand.forEach((c, j) => {
      pairs.push({ i: i, j: j, d: editDistance(r, c) / Math.max(r.length, c.length) });
    }));
    pairs.sort((p, q) => p.d - q.d);
    const out = [], taken = {};
    pairs.forEach(p => {
      if (out[p.i] || taken[p.j]) return;
      out[p.i] = canonical[p.j];
      taken[p.j] = true;
    });
    feats.forEach((f, i) => {
      const nm = out[i] || shapeName(f).replace(strip, "").trim();
      f.properties.tmName = { cs: nm, en: nm };
    });
  }

  // Germany's ADM3 cuts four northern Länder finer than the Kreis level, so a Kreis can
  // arrive as two features under one name. Same name = same unit: the pieces are folded
  // into a single MultiPolygon, which brings the 428 features back to the official 401.
  function mergeByName(feats) {
    const polys = g => (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]);
    const by = new Map();
    feats.forEach(f => {
      const key = f.properties.tmName.cs;
      const hit = by.get(key);
      if (!hit) { by.set(key, f); return; }
      hit.geometry = { type: "MultiPolygon", coordinates: polys(hit.geometry).concat(polys(f.geometry)) };
    });
    return Array.from(by.values());
  }

  // Slovakia and later neighbours: okres → kraj by testing the okres centroid against
  // the ADM1 polygons, with the nearest kraj as the fallback for a centroid that falls
  // just outside every one of them.
  function adm1Parents(feats, adm1, table) {
    const keys = Object.keys(table);
    const named = adm1.map(f => {
      const folded = window.foldAscii(shapeName(f));
      const key = keys.find(k => folded === k) || keys.find(k => folded.indexOf(k) >= 0);
      return { f: f, meta: key ? table[key] : null, c: d3.geoCentroid(f) };
    }).filter(r => r.meta);
    feats.forEach(f => {
      const c = d3.geoCentroid(f);
      let hit = named.find(r => d3.geoContains(r.f, c));
      if (!hit) hit = named.slice().sort((a, b) => d3.geoDistance(a.c, c) - d3.geoDistance(b.c, c))[0];
      f.properties.tmParent = hit ? hit.meta.id : null;
    });
    return named;
  }

  async function build(country) {
    const jobs = [d3.json(R.SRC.url(country.iso3, country.adm || "ADM2")), world(country)];
    if (country.parents === "adm1") jobs.push(d3.json(R.SRC.url(country.iso3, "ADM1")));
    const [a2, worldFeats, a1] = await Promise.all(jobs);

    a2.features.forEach(rewind);
    let adm1 = null;
    if (a1) { a1.features.forEach(rewind); adm1 = a1.features; }

    if (country.parents === "adm1") {
      if (country.districtList) repairNames(a2.features, window[country.districtList], /^District of\s*/i);
      else a2.features.forEach(f => {
        let nm = shapeName(f);
        // "Eisenstadt(Stadt)" reads better with the space geoBoundaries drops; Polish
        // powiaty are listed by their own adjective, cities by their name.
        if (country.nameStyle === "de") nm = nm.replace(/\s*\(/, " (");
        if (country.nameStyle === "pl") nm = nm.replace(/^powiat\s+/i, "").replace(/^./, ch => ch.toUpperCase());
        f.properties.tmName = { cs: nm, en: nm };
      });
      if (country.mergeDuplicates) a2.features = mergeByName(a2.features);
      adm1 = adm1Parents(a2.features, adm1, window[country.regionTable]);
    } else czParents(a2.features);

    // One topology for both levels: kraje are the union of their okresy, so the two maps
    // share every boundary line instead of coming from two separate generalisations.
    const tp = topojson.topology({ d: a2 }, 1e5);
    const geoms = tp.objects.d.geometries;
    const feats = topojson.feature(tp, tp.objects.d).features;
    const parentOf = g => (g.properties && g.properties.tmParent) || null;

    const districts = feats.map((f, i) => {
      const nm = f.properties.tmName;
      const id = window.slugId(country.id, nm.cs);
      // The unit id also lives on the topology geometry, so the map can colour a shared
      // boundary arc by the units on either side of it.
      f.properties.tmId = id;
      geoms[i].properties.tmId = id;
      return {
        id: id, name: nm.en, nameCs: nm.cs,
        level: "districts", parent: parentOf(f), f: f,
        seat: country.id === "CZ" ? czSeat(f, nm.cs) : null
      };
    });

    const metas = country.id === "CZ"
      ? Object.keys(R.CZR).map(cz => ({ id: R.CZR[cz].id, en: R.CZR[cz].en, cs: cz }))
      : adm1.map(r => ({ id: r.meta.id, en: r.meta.en, cs: r.meta.cs }))
          .sort((p, q) => p.id.localeCompare(q.id));

    const regions = metas.map(meta => {
      const mine = geoms.filter(g => parentOf(g) === meta.id);
      const merged = { type: "Feature", properties: {}, geometry: topojson.merge(tp, mine) };
      rewind(merged);
      const seat = country.id === "CZ"
        ? czSeat(merged, (window.CZ_REGION_SEAT || {})[meta.id])
        : seatAt(merged, (window[country.regionSeats] || {})[meta.id]);
      return {
        id: meta.id, name: meta.en, nameCs: meta.cs, level: "regions",
        parent: null, f: merged, seat: seat
      };
    }).filter(r => r.f.geometry && r.f.geometry.coordinates.length);

    return {
      regions: regions,
      districts: districts,
      topo: tp,
      world: worldFeats
    };
  }

  R.loadCountry = async function (id) {
    const country = R.country(id);
    if (!cache[id]) cache[id] = build(country);
    const g = await cache[id];
    if (s.country !== id) return;          // the user has already moved on
    s.regions = g.regions;
    s.districts = g.districts;
    s.topo = g.topo;
    s.world = g.world;
  };
})(window.R);
