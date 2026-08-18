# Travelmap

The personal travel map of Václav Jícha. A static site for tracking the countries visited. Runs on GitHub Pages, no server.

## Setup

1. Push this folder to a GitHub repository.
2. Settings → Pages → deploy from `main`, root folder.
3. Open `assets/config.js` and fill in `github.owner` and `github.repo`.
4. Change the editor password (see below).

## What it tracks

Per place: visited yes/no, year of first visit, whether you saw the capital.
A visited capital shows on the map as a small black dot; unvisited capitals are not drawn.
Continents start locked and open as soon as one place there is marked visited.

Three categories, separated in the list and coloured differently on the map:

- **Countries** — the 195 (193 UN members plus Vatican City and Palestine)
- **Partially recognised states** — Kosovo, Taiwan, Western Sahara, Somaliland and others
- **Territories** — dependencies and autonomous territories, 252 places in total

## Password

The default editor password is `travel2026`. Anyone without it can browse but not edit.
To change it: sign in, press **Change password** in the Data panel, type the new one, and
commit the `passwordHash` line it gives you into `assets/config.js`.

Only the SHA-256 hash of the password is in the code, never the password itself. The hash is
still public, so a short or common password can be brute-forced — pick a long one. This is a
gate against casual visitors, not real security; the data in a public repository is public
either way.

## Saving from any device

Editing writes to the browser first, so it is instant and works offline. Pressing **Save**
commits `data/travel.json` back to GitHub through the API, which is what makes your record
appear on every other device.

The first save asks for a GitHub token, stored only in that browser:

1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Repository access: only this repository. Permissions: **Contents → Read and write**.
3. Paste it when asked.

Don't do this on a shared computer. `Download JSON` is the manual alternative: it gives you
the file to commit yourself.

## Files

```
index.html            page
assets/styles.css     styles
assets/app.js         logic
assets/config.js      your settings
assets/countries.js   252 places: countries, partially recognised states, territories
data/travel.json      your record
```

Geometry is Natural Earth data via `world-atlas` (public domain), drawn with d3-geo.
Places too small for the low-resolution outlines (Monaco, Vatican City, Luxembourg, Singapore,
the Pacific islands) are drawn as a clickable callout circle joined by a hairline to their
real location, so they never disappear or overlap.

The list follows Czech practice: Kosovo is included as a state, under partially recognised.
