// Password gate, session chrome, and saving data back to GitHub.
(function (R) {
  "use strict";
  const s = R.s, $ = R.$, t = R.t;

  async function sha256(str) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  R.sessionChrome = function () {
    $("mode").textContent = s.editing ? t("editing") : t("reading");
    $("mode").classList.toggle("live", s.editing);
    $("unlockBtn").textContent = s.editing ? t("signOut") : t("signIn");
    const sb = $("saveBtn");
    if (!sb.disabled) sb.textContent = t("save");
  };

  R.setEditing = function (on) {
    s.editing = on;
    R.sessionChrome();
    $("saveBtn").hidden = !on;
    R.render();
  };

  $("unlockBtn").onclick = () => {
    if (s.editing) { $("logoutDlg").showModal(); return; }
    $("pwErr").textContent = ""; $("pw").value = "";
    $("loginDlg").showModal(); $("pw").focus();
  };
  $("loginCancel").onclick = () => $("loginDlg").close();
  $("logoutCancel").onclick = () => $("logoutDlg").close();
  $("logoutGo").onclick = () => {
    $("logoutDlg").close();
    sessionStorage.removeItem(R.SS_SESSION);
    R.setEditing(false);
  };
  $("pw").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("loginGo").click(); } };
  $("loginGo").onclick = async () => {
    if ((await sha256($("pw").value)) !== R.CFG.passwordHash) { $("pwErr").textContent = t("badPassword"); return; }
    sessionStorage.setItem(R.SS_SESSION, "1");
    $("loginDlg").close();
    R.setEditing(true);
  };

  const b64 = str => btoa(String.fromCharCode(...new TextEncoder().encode(str)));

  async function pushToGitHub(token) {
    const g = R.CFG.github;
    const api = "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" + R.DATA_PATH;
    const head = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    let sha = null;
    const cur = await fetch(api + "?ref=" + g.branch, { headers: head });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status === 401) throw new Error("Token rejected. Check that it was pasted in full and has not expired.");
    else if (cur.status === 403) throw new Error("Token lacks permission. It needs Contents: Read and write for " + g.owner + "/" + g.repo + ".");
    else if (cur.status !== 404) throw new Error("Cannot read the file (" + cur.status + ").");
    const body = {
      message: "Update region record (" + Object.keys(s.data.places).length + " places)",
      content: b64(JSON.stringify(s.data, null, 2) + "\n"),
      branch: g.branch
    };
    if (sha) body.sha = sha;
    const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
    if (!put.ok) {
      const msg = await put.text();
      if (put.status === 404) throw new Error("Repository " + g.owner + "/" + g.repo + " not found, or the token has no access to it.");
      if (put.status === 401) throw new Error("Token rejected. Check that it was pasted in full and has not expired.");
      if (put.status === 403) throw new Error("Token lacks permission to write to " + g.owner + "/" + g.repo + ".");
      if (put.status === 409) throw new Error("Branch " + g.branch + " is out of sync. Reload the page and try again.");
      throw new Error("Save failed (" + put.status + "). " + msg.slice(0, 120));
    }
  }

  $("saveBtn").onclick = () => {
    const tk = localStorage.getItem(R.LS_TOKEN);
    if (tk) { doSave(tk); return; }
    $("tokErr").textContent = ""; $("tok").value = "";
    $("tokenDlg").showModal(); $("tok").focus();
  };
  $("tokCancel").onclick = () => $("tokenDlg").close();
  $("tokGo").onclick = () => {
    const tk = $("tok").value.trim();
    if (!tk) { $("tokErr").textContent = t("tokenMissing"); return; }
    $("tokenDlg").close();
    localStorage.setItem(R.LS_TOKEN, tk);
    doSave(tk);
  };

  async function doSave(token) {
    const btn = $("saveBtn");
    btn.disabled = true; btn.textContent = t("saving");
    try {
      await pushToGitHub(token);
      s.dirty = false;
      btn.textContent = t("saved");
      setTimeout(() => { btn.textContent = t("save"); btn.disabled = false; }, 1400);
      R.syncState();
    } catch (e) {
      localStorage.removeItem(R.LS_TOKEN);
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
    $("pwOut").textContent = 'passwordHash: "' + (await sha256(v)) + '",';
    $("pwOut").hidden = false;
  };
})(window.R);
