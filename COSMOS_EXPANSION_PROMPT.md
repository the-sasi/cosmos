# COSMOS Multi-Universe Expansion — Master Prompt

You are working on **COSMOS**, an interactive 3D universe-exploration platform, at `c:\sasi\NeuroForge\arcturus\cosmos`. It has already been expanded from a single solar-system simulator into a **many-universes platform**. This prompt is the complete record of that architecture and content, and the recipe for extending it. Read `CONTRACT.md` first — it is binding.

---

## 1. The platform (hard constraints — never violate)

- Zero-build, single-page, runs from `file://`. **No network, no ES modules, no imports, no fetch, no build step.** Three.js **r152 UMD** as global `THREE`.
- Every feature is ONE classic IIFE script registered as `COSMOS.register('name', function (ctx) { ... })`, loaded via a `<script>` tag in `index.html` (load order matters).
- ONE scene, ONE camera, ONE continuous zoom. Floating origin (camera pinned at 0,0,0; the `world` group is offset by −cameraPos each frame). 1 world unit = 1 Earth radius = 6,371 km.
- Lighting is engine-owned: one PointLight at the Sun + faint ambient. Modules never add lights. Renderer: `logarithmicDepthBuffer`, `useLegacyLights`, `NoToneMapping`, sRGB. Raw ShaderMaterials MUST include the log-depth chunks (`logdepthbuf_pars_vertex/fragment` etc.).
- Animate ONLY via `ctx.onUpdate(fn)`; multiply all motion by `state.timeScale`. No per-frame allocations. Procedural textures built ONCE via canvas at `ctx.quality.texSize` (512 low / 1024 high tier), `colorSpace = SRGBColorSpace`.
- Key engine gate: `selectable()` in `engine.js` — when zoomed out past `viewWidthUnits > 8e5`, only the Sun is click-travelable. **`COSMOS.setFocusByName(name, {radiusMult})` bypasses this** — it is the warp primitive everything below is built on.
- **No `engine.js` edits were needed for any of this.** Keep it that way (Contract rule: new universes must be addable without engine changes).

## 2. The multi-universe architecture (already built)

### 2a. `js/atlas.js` — the Cosmos Atlas (universe navigator)
- A "◎ atlas" button (top-right, pulses until first opened) opens a scrollable panel of destinations grouped by category.
- API: `COSMOS.registerDestination({id, label, category, focus, radiusMult, note, blurb, warn, order, warp})`
  - `focus`: name of a registered focusable → warp via `COSMOS.setFocusByName`.
  - `warp`: optional custom function overriding the default warp (e.g. `COSMOS.focusEarthPoint` dives).
  - `order` (default 500): sorts rows within a category; a category's position = its minimum order. Anime universes use low orders (1–4) so they appear ABOVE the solar-system seeds (order 900+).
  - On arrival: screen flash + `blurb` shown as a HUD toast.
- Seeds itself with the real solar system (Sun, 8 planets, Moon, black hole, wormhole).
- A one-time hint toast (~7 s after load) tells users the Atlas exists.

### 2b. `js/universes/universe_core.js` — the separate-universe framework
Every universe is a **sealed pocket of space** far from everything else (anchors at 40,000–100,000 units out, away from the black hole `[90000,9000,-62000]` and wormhole `[-72000,-6000,108000]`):

- `COSMOS.createUniverse(ctx, {id, center:[x,y,z], radius, theme})` builds:
  - An **opaque themed sky shell** (BackSide sphere, MeshBasicMaterial + canvas sky texture). Because it writes depth, once the camera is inside, the Milky Way, deep sky, solar system and all other universes are hidden — the user is *somewhere else entirely*. From outside, the shell is invisible (BackSide).
  - Theme: `{base:'#hex', nebulae:[{rgb:'r,g,b', n}], starColor, starCount, glint}` — every universe gets a visually distinct sky.
  - **Local stars** (screen-constant Points inside the shell, hidden when far).
  - A **beacon glint** sprite (screen-clamped size ~7 px) so the universe is spottable and clickable from anywhere; hidden once inside.
  - One shared `onUpdate` manages all universes' glints/stars (no per-universe cost).
- `COSMOS.buildWorld(ctx, u, opts)` raises a globe inside a universe with everything wired:
  - `{id, label, R, offset, tex, atmColor, specular, shininess, category, order, note, blurb, markers:[...]}`
  - Builds: MeshPhong globe + optional additive fresnel atmosphere (log-depth-correct shader) + focus registration (`parent:'sun'`) + Atlas row (`▸ Label`).
  - `markers: [{id, name, lat, lon, alt, color, tex, tall, size, note, blurb, atlas, order, labelColor}]` — each becomes: a sprite beacon on the surface (standard equirect `latLonToVec3`, matches three.js sphere UVs so painted maps align), a focusable (`<worldId>_<markerId>`, parent = the world), an optional Atlas destination, a proximity/facing-gated floating label, and a one-time **arrival lore toast** (`name — blurb`).
  - `COSMOS.latLonToVec3(lat, lon, r, out)` is exported for custom overlays.

## 3. Universes already built (each in its own folder under `js/universes/`)

| Universe | Files | Anchor | Sky theme | Content |
|---|---|---|---|---|
| **One Piece** | `onepiece/data_onepiece.js` + `onepiece/mod_onepiece.js` | `[34000,2600,46000]` | Deep sea-navy; gold/cerulean/rose nebulae; glint `#8fd0ff` | "The Blue Planet" (R = 1.6) with a **canon-accurate painted map** + ~28 islands (below) |
| **Solo Leveling** | `solo-leveling/mod_sololeveling.js` | `[-52000,-3000,76000]` | Near-black indigo; violet mana + gate-blue + red-gate nebulae; glint `#a86ae8` | Its **own** "Hunter's Earth" (R = 1.0): dark globe, glowing real country borders (reuses `COSMOS_GEO`), portal-rift Gates (below) |
| **Dragon Ball** | `dragonball/mod_dragonball.js` | `[64000,7000,30000]` | Saturated night-blue; dragon-orange/ki-blue/gold nebulae; glint `#ffb84a` | Four worlds: Earth (Z Fighters), Planet Namek (green seas, three suns), Planet Vegeta (rust, destroyed-by-Frieza lore), King Kai's Planet (R = 0.06, 10× gravity) |
| **Naruto** | `naruto/mod_naruto.js` | `[-38000,5200,-58000]` | Moonless dark with **red clouds** (Akatsuki); glint `#ff6a5a` | "The Shinobi World" (R = 1.0): Five Great Nations painted schematically; villages Konohagakure, Sunagakure, Kirigakure, Iwagakure, Kumogakure as marker destinations with canon lore |
| **Real Universe** | (original engine + modules) | origin | — | Sun, 8 planets, Moon + 7 moons, Earth (NASA textures, borders, cities, monuments), black hole, wormhole, Milky Way, deep sky |

### 3a. One Piece — canonical coordinate model (in `data_onepiece.js`, wiki-sourced)
- **Red Line** = the great-circle continent ring at longitudes 0°/180°. **Grand Line** = the equator, perpendicular, crossing it at exactly two points: **Reverse Mountain** (0°, 0°) and **Mary Geoise / Fish-Man Island** (0°, 180°).
- Two **Calm Belts** flank the Grand Line. The four **Blues** are the quadrants: East Blue SE, North Blue NE, West Blue NW, South Blue SW (relative to Reverse Mountain).
- **Paradise** = equator lon 0→180 (islands in true story order): Reverse Mountain → Twin Cape → Whisky Peak → Little Garden → Drum Island → Alabasta → Jaya (+ **Skypiea at `alt: 0.34` floating above Jaya**) → Long Ring Long Land → Water 7 → Enies Lobby → Thriller Bark → Sabaody Archipelago.
- **Fish-Man Island** (`alt: −0.16`, i.e. 10,000 m deep) directly beneath the Red Line; **Mary Geoise** atop it (`alt: 0.06`).
- **New World** = equator lon 180→360: Punk Hazard → Dressrosa → Zou → Whole Cake Island → Wano → Egghead → Elbaf → **Laugh Tale** (lon ~354, closing the loop).
- **East Blue origin islands** in the SE quadrant: Dawn Island (Foosha), Shells Town, Orange Town, Syrup Village, Baratie, Arlong Park, Loguetown (at the Red Line's foot, near the entrance).
- The map texture paints all of this (quadrant tints, Calm Belts, Grand Line road, Red Line ring with sunlit edge, island landmasses with archipelago clusters); markers sit exactly on the painted islands. Every island has `half`, `landmark`, and a lore `blurb`; ~17 flagged `atlas: true`.
- Exact degrees are schematic (Oda never published a scaled map) — **topology and story order are canon**. KNOWN NEXT STEP: the fan site `https://www.op-maps.com/en` hosts a more detailed fan-standard layout; its island positions could be extracted (it is Cloudflare-protected — fetch with a browser User-Agent) and mapped to lat/lon to refine positions.

### 3b. Solo Leveling — canonical gates (wiki-sourced, real coordinates)
Blue rifts = Gates, crimson = S-rank catastrophes, gold dots = National Level Hunters:
Seoul hub (37.5665, 126.978); the Double Dungeon / Cartenon Temple (37.5568, 126.9237); **Jeju Island S-rank Ant Gate** (33.362, 126.533 — Beru/Ant King lore); **Tokyo S-Rank Gate** (35.6762, 139.6503 — Legia's Giants, dungeon break); **Kamish's Wrath** (34.05, −118.24 — first S-rank gate, the dragon Kamish, birth of the National Level Hunters); Liu Zhigang (Beijing), Siddharth Bachchan (Delhi), Antoine Martinez (Paris).
Canon accuracy flags: National Level is a designation above S, not a rank letter; Tarnak = Iron Body Monarch ≠ Baran = White Flames; Frost = Sillad, Beasts = Rakan; the double-dungeon street address is soft canon.

## 4. UX behaviors (all implemented)
- Atlas warp: flash → instant `setFocusByName` → lore toast. Custom `warp` functions supported.
- Universe beacons: clickable glint stars from the solar system; local stars fade in on approach; sky shell takes over inside.
- Marker labels: shown only when near (`< 26 R`), facing the camera, on-screen, labels toggle respected; screen-constant size.
- One-time arrival lore toasts per world and per marker.
- Category ordering: One Piece (1) → Solo Leveling (2) → Dragon Ball (3) → Naruto (4) → Real · Solar System (900) → Real · Deep space (950).

## 5. Recipe: add a NEW universe (~1 file, no engine edits)
1. Create `js/universes/<name>/mod_<name>.js`:
```js
(function () {
  'use strict';
  COSMOS.register('<name>', function (ctx) {
    if (!COSMOS.createUniverse) return;
    var u = COSMOS.createUniverse(ctx, {
      id: '<name>', center: [X, Y, Z],   // 40k–100k out, far from other anchors
      radius: 420,
      theme: { base: '#...', nebulae: [{ rgb: 'r,g,b', n: 6 }], starColor: '#...', starCount: 1400, glint: '#...' }
    });
    COSMOS.buildWorld(ctx, u, {
      id: '<name>', label: '<World Name>', R: 1.0,
      tex: makeYourCanvasTexture(),      // equirect W=texSize*2, H=texSize, sRGB
      atmColor: '#...', category: 'Anime · <Franchise>', order: 5, note: '...',
      blurb: '<arrival lore>',
      markers: [ { id, name, lat, lon, color, note, blurb, atlas: true }, ... ]
    });
  });
})();
```
2. Add its `<script>` tag in `index.html` after `universe_core.js`.
3. `node --check` the file. Done — Atlas, warp, labels, lore all come free.

Rules (from the product vision): research the franchise; keep canon names/hierarchy/lore; if the source only has a few notable places, add only those (don't invent a galaxy); every universe gets a DISTINCT visual theme; every object should teach (what/where/why/how/facts via blurbs); the user should always feel there is more left to discover.

## 6. Load order in `index.html` (current)
`three.min.js` → `assets.js` → `assets_planets.js` → `geo_data.js` → `engine.js` → `mod_universe.js` → `mod_solar.js` → `mod_earth.js` → `mod_geo.js` → `mod_exotic.js` → `mod_monuments.js` → `atlas.js` → `universes/universe_core.js` → `universes/onepiece/data_onepiece.js` → `universes/onepiece/mod_onepiece.js` → `universes/solo-leveling/mod_sololeveling.js` → `universes/dragonball/mod_dragonball.js` → `universes/naruto/mod_naruto.js` → `COSMOS.boot()`.

## 7. Backlog (next expansions, in priority order)
1. **One Piece map fidelity**: extract island positions from op-maps.com (browser-UA fetch) and refine `data_onepiece.js`; add Amazon Lily / Impel Down / Marineford in the Calm Belt; Log Pose route line along the equator.
2. More anime: Bleach (Soul Society/Hueco Mundo as twin worlds), Pokémon (Kanto…), Attack on Titan (Paradis island world), Gundam (Earth + colonies), Demon Slayer, Jujutsu Kaisen (Solo-Leveling-style overlay pattern).
3. Other categories from the vision: Movies (Star Wars, Interstellar — reuse existing wormhole/black hole), Games (Mass Effect relay graph), Mythology (Norse Yggdrasil tree-of-realms), Scientific simulations (star life-cycle, Big Bang), Original procedural (Crystal Galaxy with bespoke shaders).
4. Education layer: per-object info cards via `ctx.showInfo(html)` (what/where/why/how-formed/timeline/facts/related), hidden objects & rare events for the curiosity principle.

Every claim above matches the code in this repo. Verify with the browser (open `index.html`, press ◎ atlas) and `node --check` after any edit.
