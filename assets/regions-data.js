// ── Regions: sources, identifiers and names ─────────────────────────────────
// Geometry comes from geoBoundaries (gbOpen, CC BY 4.0), which redistributes national
// administrative boundaries. ADM1 = kraje, ADM2 = okresy. Files are served through the
// LFS media host, which allows cross-origin reads.
window.REGION_SOURCE = {
  base: "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/",
  url: function (iso3, level) {
    return this.base + iso3 + "/" + level + "/geoBoundaries-" + iso3 + "-" + level + "_simplified.geojson";
  }
};

// Each country is mapped in the UTM zone it is usually published in: transverse Mercator
// on that zone's central meridian. Czechia sits in zone 33N, Slovakia in 34N.
// `parents` says how okresy are tied to kraje: "table" from the hand-kept list below,
// "adm1" by testing each okres against the ADM1 polygons.
window.REGION_COUNTRIES = [
  {
    id: "CZ", iso3: "CZE", name: "Czechia", nameCs: "Česko",
    of: { en: "of Czechia", cs: "Česka" },
    flag: "https://flagcdn.com/cz.svg", worldName: "Czechia",
    regions: 14, districts: 77, parents: "table", seatKey: "seatKraj",
    view: { type: "transverseMercator", rotate: [-15, 0], label: "ETRS89 / UTM 33N · EPSG:25833" }
  },
  {
    id: "AT", iso3: "AUT", name: "Austria", nameCs: "Rakousko",
    of: { en: "of Austria", cs: "Rakouska" },
    flag: "https://flagcdn.com/at.svg", worldName: "Austria",
    regions: 9, districts: 94, parents: "adm1", seatKey: "seatLand",
    regionTable: "AT_REGIONS", regionSeats: "AT_REGION_SEATS", nameStyle: "de",
    view: { type: "conicConformal", rotate: [-13.33, 0], center: [0, 47.5], parallels: [46, 49],
      label: "MGI / Austria Lambert · EPSG:31287" }
  },
  {
    id: "DE", iso3: "DEU", name: "Germany", nameCs: "Německo",
    of: { en: "of Germany", cs: "Německa" },
    flag: "https://flagcdn.com/de.svg", worldName: "Germany",
    regions: 16, districts: 401, parents: "adm1", adm: "ADM3", nameStyle: "de", seatKey: "seatLand",
    mergeDuplicates: true,
    regionTable: "DE_REGIONS", regionSeats: "DE_REGION_SEATS",
    view: { type: "transverseMercator", rotate: [-9, 0], label: "ETRS89 / UTM 32N \u00b7 EPSG:25832" }
  },
  {
    id: "PL", iso3: "POL", name: "Poland", nameCs: "Polsko",
    of: { en: "of Poland", cs: "Polska" },
    flag: "https://flagcdn.com/pl.svg", worldName: "Poland",
    regions: 16, districts: 380, parents: "adm1", nameStyle: "pl", seatKey: "seatVoiv",
    regionTable: "PL_REGIONS", regionSeats: "PL_REGION_SEATS",
    view: { type: "transverseMercator", rotate: [-19, 0], label: "PUWG 1992 · EPSG:2180" }
  },
  {
    id: "SK", iso3: "SVK", name: "Slovakia", nameCs: "Slovensko",
    of: { en: "of Slovakia", cs: "Slovenska" },
    flag: "https://flagcdn.com/sk.svg", worldName: "Slovakia",
    regions: 8, districts: 79, parents: "adm1", seatKey: "seatKraj",
    regionTable: "SK_REGIONS", regionSeats: "SK_REGION_SEATS", districtList: "SK_DISTRICTS",
    view: { type: "transverseMercator", rotate: [-19.5, 0], label: "ETRS89 / UTM 34N · EPSG:25834" }
  }
];

// Kraj codes follow ISO 3166-2:CZ, keyed by the Czech name geoBoundaries carries.
window.CZ_REGIONS = {
  "Hlavní město Praha":   { id: "CZ-10", en: "Prague" },
  "Středočeský kraj":     { id: "CZ-20", en: "Central Bohemia" },
  "Jihočeský kraj":       { id: "CZ-31", en: "South Bohemia" },
  "Plzeňský kraj":        { id: "CZ-32", en: "Plzeň Region" },
  "Karlovarský kraj":     { id: "CZ-41", en: "Karlovy Vary Region" },
  "Ústecký kraj":         { id: "CZ-42", en: "Ústí nad Labem Region" },
  "Liberecký kraj":       { id: "CZ-51", en: "Liberec Region" },
  "Královéhradecký kraj": { id: "CZ-52", en: "Hradec Králové Region" },
  "Pardubický kraj":      { id: "CZ-53", en: "Pardubice Region" },
  "Kraj Vysočina":        { id: "CZ-63", en: "Vysočina Region" },
  "Jihomoravský kraj":    { id: "CZ-64", en: "South Moravia" },
  "Olomoucký kraj":       { id: "CZ-71", en: "Olomouc Region" },
  "Zlínský kraj":         { id: "CZ-72", en: "Zlín Region" },
  "Moravskoslezský kraj": { id: "CZ-80", en: "Moravia-Silesia" }
};

// geoBoundaries writes a handful of okres names in English. Everything not listed here
// is already the Czech name and is used for both languages.
window.CZ_DISTRICT_NAMES = {
  "Brno-City":    { cs: "Brno-město", en: "Brno-City" },
  "Brno-Country": { cs: "Brno-venkov", en: "Brno-Country" },
  "Ostrava-City": { cs: "Ostrava-město", en: "Ostrava-City" },
  "Plzeň-City":   { cs: "Plzeň-město", en: "Plzeň-City" },
  "Plzeň-North":  { cs: "Plzeň-sever", en: "Plzeň-North" },
  "Plzeň-South":  { cs: "Plzeň-jih", en: "Plzeň-South" },
  "Prague":       { cs: "Praha", en: "Prague" },
  "Prague-East":  { cs: "Praha-východ", en: "Prague-East" },
  "Prague-West":  { cs: "Praha-západ", en: "Prague-West" },
  "Rakovnik":     { cs: "Rakovník", en: "Rakovník" }
};

// Which kraj each okres belongs to. Fixed by hand: the two okresy that ring Prague have
// their centroids inside the capital, so a purely geometric test misfiles them.
window.CZ_DISTRICT_PARENT = {
  "Praha": "CZ-10",
  "Benešov": "CZ-20", "Beroun": "CZ-20", "Kladno": "CZ-20", "Kolín": "CZ-20",
  "Kutná Hora": "CZ-20", "Mělník": "CZ-20", "Mladá Boleslav": "CZ-20", "Nymburk": "CZ-20",
  "Praha-východ": "CZ-20", "Praha-západ": "CZ-20", "Příbram": "CZ-20", "Rakovník": "CZ-20",
  "České Budějovice": "CZ-31", "Český Krumlov": "CZ-31", "Jindřichův Hradec": "CZ-31",
  "Písek": "CZ-31", "Prachatice": "CZ-31", "Strakonice": "CZ-31", "Tábor": "CZ-31",
  "Domažlice": "CZ-32", "Klatovy": "CZ-32", "Plzeň-město": "CZ-32", "Plzeň-jih": "CZ-32",
  "Plzeň-sever": "CZ-32", "Rokycany": "CZ-32", "Tachov": "CZ-32",
  "Cheb": "CZ-41", "Karlovy Vary": "CZ-41", "Sokolov": "CZ-41",
  "Děčín": "CZ-42", "Chomutov": "CZ-42", "Litoměřice": "CZ-42", "Louny": "CZ-42",
  "Most": "CZ-42", "Teplice": "CZ-42", "Ústí nad Labem": "CZ-42",
  "Česká Lípa": "CZ-51", "Jablonec nad Nisou": "CZ-51", "Liberec": "CZ-51", "Semily": "CZ-51",
  "Hradec Králové": "CZ-52", "Jičín": "CZ-52", "Náchod": "CZ-52",
  "Rychnov nad Kněžnou": "CZ-52", "Trutnov": "CZ-52",
  "Chrudim": "CZ-53", "Pardubice": "CZ-53", "Svitavy": "CZ-53", "Ústí nad Orlicí": "CZ-53",
  "Havlíčkův Brod": "CZ-63", "Jihlava": "CZ-63", "Pelhřimov": "CZ-63", "Třebíč": "CZ-63",
  "Žďár nad Sázavou": "CZ-63",
  "Blansko": "CZ-64", "Brno-město": "CZ-64", "Brno-venkov": "CZ-64", "Břeclav": "CZ-64",
  "Hodonín": "CZ-64", "Vyškov": "CZ-64", "Znojmo": "CZ-64",
  "Jeseník": "CZ-71", "Olomouc": "CZ-71", "Prostějov": "CZ-71", "Přerov": "CZ-71", "Šumperk": "CZ-71",
  "Kroměříž": "CZ-72", "Uherské Hradiště": "CZ-72", "Vsetín": "CZ-72", "Zlín": "CZ-72",
  "Bruntál": "CZ-80", "Frýdek-Místek": "CZ-80", "Karviná": "CZ-80", "Nový Jičín": "CZ-80",
  "Opava": "CZ-80", "Ostrava-město": "CZ-80"
};

// Seats: the okres town, and the kraj capital. Coordinates are WGS 84 [lon, lat].
// A seat that falls outside its own unit – the okresy ringing Prague, Brno and Plzeň are
// administered from cities that are not part of them – simply gets no dot.
window.CZ_SEATS = {
  "Praha": [14.42, 50.08],
  "Benešov": [14.69, 49.78], "Beroun": [14.07, 49.96], "Kladno": [14.10, 50.14],
  "Kolín": [15.20, 50.03], "Kutná Hora": [15.27, 49.95], "Mělník": [14.47, 50.35],
  "Mladá Boleslav": [14.90, 50.41], "Nymburk": [15.04, 50.19],
  "Praha-východ": [14.42, 50.08], "Praha-západ": [14.42, 50.08],
  "Příbram": [14.01, 49.69], "Rakovník": [13.73, 50.10],
  "České Budějovice": [14.47, 48.97], "Český Krumlov": [14.32, 48.81],
  "Jindřichův Hradec": [15.00, 49.14], "Písek": [14.15, 49.31], "Prachatice": [13.99, 49.01],
  "Strakonice": [13.90, 49.26], "Tábor": [14.66, 49.41],
  "Domažlice": [12.93, 49.44], "Klatovy": [13.29, 49.40], "Plzeň-město": [13.38, 49.75],
  "Plzeň-jih": [13.38, 49.75], "Plzeň-sever": [13.38, 49.75], "Rokycany": [13.60, 49.74],
  "Tachov": [12.63, 49.79],
  "Cheb": [12.37, 50.08], "Karlovy Vary": [12.87, 50.23], "Sokolov": [12.64, 50.18],
  "Děčín": [14.21, 50.78], "Chomutov": [13.42, 50.46], "Litoměřice": [14.13, 50.53],
  "Louny": [13.80, 50.36], "Most": [13.64, 50.50], "Teplice": [13.82, 50.64],
  "Ústí nad Labem": [14.04, 50.66],
  "Česká Lípa": [14.54, 50.69], "Jablonec nad Nisou": [15.17, 50.72], "Liberec": [15.06, 50.77],
  "Semily": [15.33, 50.60],
  "Hradec Králové": [15.83, 50.21], "Jičín": [15.35, 50.44], "Náchod": [16.16, 50.42],
  "Rychnov nad Kněžnou": [16.28, 50.16], "Trutnov": [15.91, 50.56],
  "Chrudim": [15.80, 49.95], "Pardubice": [15.78, 50.04], "Svitavy": [16.47, 49.76],
  "Ústí nad Orlicí": [16.39, 49.97],
  "Havlíčkův Brod": [15.58, 49.61], "Jihlava": [15.59, 49.40], "Pelhřimov": [15.22, 49.43],
  "Třebíč": [15.88, 49.21], "Žďár nad Sázavou": [15.94, 49.56],
  "Blansko": [16.64, 49.36], "Brno-město": [16.61, 49.19], "Brno-venkov": [16.61, 49.19],
  "Břeclav": [16.88, 48.76], "Hodonín": [17.13, 48.85], "Vyškov": [17.00, 49.28],
  "Znojmo": [16.05, 48.86],
  "Jeseník": [17.20, 50.23], "Olomouc": [17.25, 49.59], "Prostějov": [17.11, 49.47],
  "Přerov": [17.45, 49.46], "Šumperk": [16.97, 49.97],
  "Kroměříž": [17.39, 49.30], "Uherské Hradiště": [17.46, 49.07], "Vsetín": [17.99, 49.34],
  "Zlín": [17.67, 49.22],
  "Bruntál": [17.46, 49.99], "Frýdek-Místek": [18.35, 49.68], "Karviná": [18.54, 49.85],
  "Nový Jičín": [18.01, 49.59], "Opava": [17.90, 49.94], "Ostrava-město": [18.29, 49.84]
};

window.CZ_REGION_SEAT = {
  "CZ-10": "Praha", "CZ-20": "Praha", "CZ-31": "České Budějovice", "CZ-32": "Plzeň-město",
  "CZ-41": "Karlovy Vary", "CZ-42": "Ústí nad Labem", "CZ-51": "Liberec",
  "CZ-52": "Hradec Králové", "CZ-53": "Pardubice", "CZ-63": "Jihlava",
  "CZ-64": "Brno-město", "CZ-71": "Olomouc", "CZ-72": "Zlín", "CZ-80": "Ostrava-město"
};

window.CZ_SEAT_LABEL = { "Plzeň-město": "Plzeň", "Brno-město": "Brno", "Ostrava-město": "Ostrava" };

// ── Slovakia ────────────────────────────────────────────────────────────────
// Kraj codes follow ISO 3166-2:SK. geoBoundaries writes the ADM1 names sometimes in
// Slovak ("Žilinský kraj"), sometimes in English ("Žilina Region"), so the table is keyed
// by the folded prefix the two spellings share.
window.SK_REGIONS = {
  bratisl: { id: "SK-BL", cs: "Bratislavský kraj", en: "Bratislava Region" },
  trnav:   { id: "SK-TA", cs: "Trnavský kraj", en: "Trnava Region" },
  trenc:   { id: "SK-TC", cs: "Trenčiansky kraj", en: "Trenčín Region" },
  nitr:    { id: "SK-NI", cs: "Nitriansky kraj", en: "Nitra Region" },
  zilin:   { id: "SK-ZI", cs: "Žilinský kraj", en: "Žilina Region" },
  bansk:   { id: "SK-BC", cs: "Banskobystrický kraj", en: "Banská Bystrica Region" },
  presov:  { id: "SK-PV", cs: "Prešovský kraj", en: "Prešov Region" },
  kosic:   { id: "SK-KI", cs: "Košický kraj", en: "Košice Region" }
};

// Kraj capitals. Okresy carry no dot: their seats are the towns they are named after,
// which the map already labels by name.
window.SK_REGION_SEATS = {
  "SK-BL": { name: "Bratislava", ll: [17.11, 48.15] },
  "SK-TA": { name: "Trnava", ll: [17.59, 48.38] },
  "SK-TC": { name: "Trenčín", ll: [18.04, 48.89] },
  "SK-NI": { name: "Nitra", ll: [18.09, 48.31] },
  "SK-ZI": { name: "Žilina", ll: [18.74, 49.22] },
  "SK-BC": { name: "Banská Bystrica", ll: [19.15, 48.74] },
  "SK-PV": { name: "Prešov", ll: [21.24, 49.00] },
  "SK-KI": { name: "Košice", ll: [21.26, 48.72] }
};

// The 79 okresy. geoBoundaries carries the Slovak ADM2 names mangled by a broken
// encoding ("District of Spieskn Novo Ves"), so the proper names are kept here and each
// boundary is matched to the closest one.
window.SK_DISTRICTS = [
  "Bratislava I", "Bratislava II", "Bratislava III", "Bratislava IV", "Bratislava V",
  "Malacky", "Pezinok", "Senec",
  "Dunajská Streda", "Galanta", "Hlohovec", "Piešťany", "Senica", "Skalica", "Trnava",
  "Bánovce nad Bebravou", "Ilava", "Myjava", "Nové Mesto nad Váhom", "Partizánske",
  "Považská Bystrica", "Prievidza", "Púchov", "Trenčín",
  "Komárno", "Levice", "Nitra", "Nové Zámky", "Šaľa", "Topoľčany", "Zlaté Moravce",
  "Bytča", "Čadca", "Dolný Kubín", "Kysucké Nové Mesto", "Liptovský Mikuláš", "Martin",
  "Námestovo", "Ružomberok", "Turčianske Teplice", "Tvrdošín", "Žilina",
  "Banská Bystrica", "Banská Štiavnica", "Brezno", "Detva", "Krupina", "Lučenec", "Poltár",
  "Revúca", "Rimavská Sobota", "Veľký Krtíš", "Zvolen", "Žarnovica", "Žiar nad Hronom",
  "Bardejov", "Humenné", "Kežmarok", "Levoča", "Medzilaborce", "Poprad", "Prešov",
  "Sabinov", "Snina", "Stará Ľubovňa", "Stropkov", "Svidník", "Vranov nad Topľou",
  "Gelnica", "Košice I", "Košice II", "Košice III", "Košice IV", "Košice-okolie",
  "Michalovce", "Rožňava", "Sobrance", "Spišská Nová Ves", "Trebišov"
];

// ── Austria ─────────────────────────────────────────────────────────────────
// Länder codes follow ISO 3166-2:AT; keyed by the folded German name geoBoundaries
// carries. Bezirke keep their German names in both languages.
window.AT_REGIONS = {
  burgenland:       { id: "AT-1", cs: "Burgenland", en: "Burgenland" },
  karnten:          { id: "AT-2", cs: "Korutany", en: "Carinthia" },
  niederosterreich: { id: "AT-3", cs: "Dolní Rakousko", en: "Lower Austria" },
  oberosterreich:   { id: "AT-4", cs: "Horní Rakousko", en: "Upper Austria" },
  salzburg:         { id: "AT-5", cs: "Salcbursko", en: "Salzburg" },
  steiermark:       { id: "AT-6", cs: "Štýrsko", en: "Styria" },
  tirol:            { id: "AT-7", cs: "Tyrolsko", en: "Tyrol" },
  vorarlberg:       { id: "AT-8", cs: "Vorarlbersko", en: "Vorarlberg" },
  wien:             { id: "AT-9", cs: "Vídeň", en: "Vienna" }
};

// Land capitals. Bezirke carry no dot of their own.
window.AT_REGION_SEATS = {
  "AT-1": { name: "Eisenstadt", ll: [16.52, 47.85] },
  "AT-2": { name: "Klagenfurt", ll: [14.31, 46.62] },
  "AT-3": { name: "Sankt Pölten", ll: [15.62, 48.20] },
  "AT-4": { name: "Linz", ll: [14.29, 48.31] },
  "AT-5": { name: "Salzburg", ll: [13.05, 47.81] },
  "AT-6": { name: "Graz", ll: [15.44, 47.07] },
  "AT-7": { name: "Innsbruck", ll: [11.40, 47.27] },
  "AT-8": { name: "Bregenz", ll: [9.75, 47.50] },
  "AT-9": { name: "Wien", ll: [16.37, 48.21] }
};

// ── Poland ──────────────────────────────────────────────────────────────────
// Voivodeship codes follow ISO 3166-2:PL. geoBoundaries names the ADM1 units in English,
// so the keys are the folded English name; the order matters, because "Lower Silesian"
// and "West Pomeranian" have to be tested before the plain "Silesian" and "Pomeranian".
window.PL_REGIONS = {
  "lower silesian":       { id: "PL-02", cs: "Dolnoslezské vojvodství", en: "Lower Silesian Voivodeship" },
  "west pomeranian":      { id: "PL-32", cs: "Západopomořanské vojvodství", en: "West Pomeranian Voivodeship" },
  "kuyavian":             { id: "PL-04", cs: "Kujavsko-pomořské vojvodství", en: "Kuyavian-Pomeranian Voivodeship" },
  "warmian":              { id: "PL-28", cs: "Varmijsko-mazurské vojvodství", en: "Warmian-Masurian Voivodeship" },
  "greater poland":       { id: "PL-30", cs: "Velkopolské vojvodství", en: "Greater Poland Voivodeship" },
  "lesser poland":        { id: "PL-12", cs: "Malopolské vojvodství", en: "Lesser Poland Voivodeship" },
  "subcarpathian":        { id: "PL-18", cs: "Podkarpatské vojvodství", en: "Subcarpathian Voivodeship" },
  "podlaskie":            { id: "PL-20", cs: "Podleské vojvodství", en: "Podlaskie Voivodeship" },
  "lodz":                 { id: "PL-10", cs: "Lodžské vojvodství", en: "Łódź Voivodeship" },
  "opole":                { id: "PL-16", cs: "Opolské vojvodství", en: "Opole Voivodeship" },
  "swietokrzyskie":       { id: "PL-26", cs: "Svatokřížské vojvodství", en: "Świętokrzyskie Voivodeship" },
  "masovian":             { id: "PL-14", cs: "Mazovské vojvodství", en: "Masovian Voivodeship" },
  "lubusz":               { id: "PL-08", cs: "Lubušské vojvodství", en: "Lubusz Voivodeship" },
  "lublin":               { id: "PL-06", cs: "Lublinské vojvodství", en: "Lublin Voivodeship" },
  "pomeranian":           { id: "PL-22", cs: "Pomořanské vojvodství", en: "Pomeranian Voivodeship" },
  "silesian":             { id: "PL-24", cs: "Slezské vojvodství", en: "Silesian Voivodeship" }
};

// Voivodeship capitals; where a voivodeship has two seats, the larger city is used.
window.PL_REGION_SEATS = {
  "PL-02": { name: "Wrocław", ll: [17.04, 51.11] },
  "PL-04": { name: "Bydgoszcz", ll: [18.00, 53.12] },
  "PL-06": { name: "Lublin", ll: [22.57, 51.25] },
  "PL-08": { name: "Zielona Góra", ll: [15.51, 51.94] },
  "PL-10": { name: "Łódź", ll: [19.46, 51.76] },
  "PL-12": { name: "Kraków", ll: [19.94, 50.06] },
  "PL-14": { name: "Warszawa", ll: [21.01, 52.23] },
  "PL-16": { name: "Opole", ll: [17.93, 50.67] },
  "PL-18": { name: "Rzeszów", ll: [21.99, 50.04] },
  "PL-20": { name: "Białystok", ll: [23.16, 53.13] },
  "PL-22": { name: "Gdańsk", ll: [18.65, 54.35] },
  "PL-24": { name: "Katowice", ll: [19.02, 50.26] },
  "PL-26": { name: "Kielce", ll: [20.63, 50.87] },
  "PL-28": { name: "Olsztyn", ll: [20.48, 53.78] },
  "PL-30": { name: "Poznań", ll: [16.93, 52.41] },
  "PL-32": { name: "Szczecin", ll: [14.55, 53.43] }
};

// ── Germany ─────────────────────────────────────────────────────────────────
// Länder come from ADM1, Kreise from ADM3 – ADM2 holds the Regierungsbezirke, which are
// not the level tracked here. Codes follow ISO 3166-2:DE, keyed by the folded German name.
window.DE_REGIONS = {
  "baden-wurttemberg":       { id: "DE-BW", cs: "Bádensko-Württembersko", en: "Baden-Württemberg" },
  "mecklenburg-vorpommern":  { id: "DE-MV", cs: "Meklenbursko-Předpomořansko", en: "Mecklenburg-Vorpommern" },
  "nordrhein-westfalen":     { id: "DE-NW", cs: "Severní Rýní-Vestfálsko", en: "North Rhine-Westphalia" },
  "schleswig-holstein":      { id: "DE-SH", cs: "Šlesvicko-Holštýnsko", en: "Schleswig-Holstein" },
  "rheinland-pfalz":         { id: "DE-RP", cs: "Porýní-Falc", en: "Rhineland-Palatinate" },
  "sachsen-anhalt":          { id: "DE-ST", cs: "Sasko-Anhaltsko", en: "Saxony-Anhalt" },
  "niedersachsen":           { id: "DE-NI", cs: "Dolní Sasko", en: "Lower Saxony" },
  "brandenburg":             { id: "DE-BB", cs: "Brandenbursko", en: "Brandenburg" },
  "thuringen":               { id: "DE-TH", cs: "Durynsko", en: "Thuringia" },
  "saarland":                { id: "DE-SL", cs: "Sársko", en: "Saarland" },
  "hamburg":                 { id: "DE-HH", cs: "Hamburk", en: "Hamburg" },
  "hessen":                  { id: "DE-HE", cs: "Hesensko", en: "Hesse" },
  "bayern":                  { id: "DE-BY", cs: "Bavorsko", en: "Bavaria" },
  "berlin":                  { id: "DE-BE", cs: "Berlín", en: "Berlin" },
  "bremen":                  { id: "DE-HB", cs: "Brémy", en: "Bremen" },
  "sachsen":                 { id: "DE-SN", cs: "Sasko", en: "Saxony" }
};

window.DE_REGION_SEATS = {
  "DE-BW": { name: "Stuttgart", ll: [9.18, 48.78] },
  "DE-BY": { name: "München", ll: [11.58, 48.14] },
  "DE-BE": { name: "Berlin", ll: [13.40, 52.52] },
  "DE-BB": { name: "Potsdam", ll: [13.06, 52.40] },
  "DE-HB": { name: "Bremen", ll: [8.81, 53.08] },
  "DE-HH": { name: "Hamburg", ll: [9.99, 53.55] },
  "DE-HE": { name: "Wiesbaden", ll: [8.24, 50.08] },
  "DE-MV": { name: "Schwerin", ll: [11.42, 53.63] },
  "DE-NI": { name: "Hannover", ll: [9.73, 52.37] },
  "DE-NW": { name: "Düsseldorf", ll: [6.78, 51.23] },
  "DE-RP": { name: "Mainz", ll: [8.27, 50.00] },
  "DE-SL": { name: "Saarbrücken", ll: [6.99, 49.24] },
  "DE-SN": { name: "Dresden", ll: [13.74, 51.05] },
  "DE-ST": { name: "Magdeburg", ll: [11.63, 52.13] },
  "DE-SH": { name: "Kiel", ll: [10.14, 54.32] },
  "DE-TH": { name: "Erfurt", ll: [11.03, 50.98] }
};

// Fold Czech, Slovak, German and Polish diacritics to ASCII, for ids and for name matching.
window.foldAscii = function (name) {
  const map = { á: "a", ä: "a", ą: "a", č: "c", ć: "c", ď: "d", é: "e", ě: "e", ę: "e",
    í: "i", ľ: "l", ĺ: "l", ł: "l", ň: "n", ń: "n", ó: "o", ô: "o", ö: "o", ŕ: "r", ř: "r",
    š: "s", ś: "s", ß: "ss", ť: "t", ú: "u", ů: "u", ü: "u", ý: "y", ž: "z", ź: "z", ż: "z" };
  return String(name).toLowerCase().replace(/[^a-z0-9 -]/g, ch => map[ch] || ch);
};

// Stable, readable ids for okresy: the local name, folded to ASCII.
window.slugId = function (country, name) {
  const s = window.foldAscii(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return country + "-" + s;
};
