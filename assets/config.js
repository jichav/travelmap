// ── Edit this file to configure your site ────────────────────────────────────
window.CONFIG = {
  // SHA-256 hash of the editor password. Default password: travel2026
  // To change it, run in your browser console:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourNewPassword'))
  //     .then(h => console.log([...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')))
  passwordHash: "e7bbd2753119f63d1bab83262e7cf7835286942712dd1caacd25d57f24b84a56",

  // Where the data lives, so edits can be saved back to GitHub from any device.
  // Fill these in with your own repository.
  github: {
    owner: "your-github-username",
    repo: "travelmap",
    branch: "main",
    path: "data/travel.json"
  }
};
