// Wiring. Loads last, once every other module has registered itself on window.R.
(function (R) {
  "use strict";
  const s = R.s;

  document.querySelectorAll(".lang").forEach(b => { b.onclick = () => R.setLang(b.dataset.lang); });
  R.applyStatic();
  if (sessionStorage.getItem(R.SS_SESSION) === "1") R.setEditing(true);

  R.loadCountry(s.country)
    .then(() => { R.bindExport(); R.render(); })
    .catch(() => { s.mapError = true; R.render(); });

  R.load();
})(window.R);
