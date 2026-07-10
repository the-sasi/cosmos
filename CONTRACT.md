# COSMOS module contract

Single-page, zero-build 3D universe explorer. Runs from `file://` — **no network, no ES modules, no imports**. Three.js **r152** UMD is global `THREE`. Everything below is binding.

## File pattern

Each module is one classic script, IIFE-wrapped:

```js
/* mod_x.js — one-line purpose */
(function () {
  'use strict';
  COSMOS.register('x', function (ctx) {
    // build once: create objects, add to ctx.world, register ctx.onUpdate(...)
  });
})();
```

Load order (index.html): `three.min.js`, `assets.js`, `engine.js`, `mod_universe.js`, `mod_solar.js`, `mod_earth.js`, `mod_exotic.js`, `mod_monuments.js`. Build functions run in that order — `mod_monuments` may rely on `ctx.shared.earthSurface` published by `mod_earth`.

## ctx API (the only surface you may touch)

| Member | Meaning |
|---|---|
| `ctx.THREE` | Three.js r152 namespace |
| `ctx.world` | THREE.Group — **add all objects here** (floating-origin root; never touch its transform) |
| `ctx.camera`, `ctx.renderer` | read-only; never reconfigure |
| `ctx.layout` | world layout constants (below) |
| `ctx.eph` | name → `THREE.Vector3` logical positions, updated per frame. Stable instances — `copy()` from them each frame, never cache their values. Keys: `sun, mercury…neptune, moon, blackhole, wormhole` |
| `ctx.state` | live per-frame state (below) |
| `ctx.quality` | `{tier: 'low'\|'high', isMobile, particleScale, texSize}` |
| `ctx.assets` | loaded THREE.Textures: `earthDay, earthNight, earthClouds, earthNormal, earthSpecular, moon` (may be missing — guard) |
| `ctx.km(x)` | km → world units |
| `ctx.onUpdate(fn)` | register `fn(dt, state)` — the ONLY way to animate. Never create your own rAF loop |
| `ctx.makeTextSprite(text, {fontPx, color})` | returns THREE.Sprite; `sprite.userData.aspect` = w/h. Scale it yourself: `s.scale.set(h*aspect, h, 1)` |
| `ctx.registerFocus({name,label,radius,minAlt,parent,getPosition})` | add a click-travel target (planets/sun/moon/blackhole/wormhole are already registered by the engine — do NOT re-register) |
| `ctx.toast(text, ms)` | HUD caption |
| `ctx.flash(color, ms)` | full-screen flash (wormhole transit) |
| `ctx.shared` | cross-module handles. `mod_earth` MUST set `ctx.shared.earthSurface` (spinning group) |
| `COSMOS.setFocusByName(name, {radiusMult})` | instant refocus (wormhole teleport) |

### ctx.state (read-only)

`t, dt, timeScale, exaggeration (1→75 animated), labelsVisible, camPos (Vector3, logical), focusName, camDist, altitude, viewWidthUnits, viewKm, camOriginDist, pixelsPerUnit(dist)`.

**All motion must multiply by `state.timeScale`** (integrate: `angle += rate * dt * state.timeScale`). The engine slows time near surfaces; ignoring this breaks the close-up experience.

## World layout — `ctx.layout` (units: 1 = Earth radius = 6,371 km)

- `SUN.radius` 109. Planets: `PLANETS[name] = {orbit, radius, period, tilt, label}` — orbits: mercury 800, venus 1400, earth 2000, mars 2800, jupiter 5200, saturn 8000, uranus 12000, neptune 16000 (XZ plane, positions come from `ctx.eph` — never compute your own).
- `MOON` {orbit 60.3 around Earth, radius 0.273}.
- `BLACKHOLE` {pos [90000, 9000, -62000], holeRadius 20, diskOuter 90}. `WORMHOLE` {pos [-72000, -6000, 108000], radius 40}.
- `STARFIELD` {rMin 250000, rMax 900000}. `GALAXY` {radius 1.4e6, thickness 9e4}. `DEEPSKY` {rMin 5e6, rMax 2.8e7}. `CAM_MAX` 5.5e7.

Sizes/positions come ONLY from `ctx.layout` / `ctx.eph`. Never invent coordinates for shared objects.

## Rendering rules (violations = broken app)

1. **Log depth**: renderer runs `logarithmicDepthBuffer: true`. Built-in materials and `THREE.Sprite` are fine. Every raw `ShaderMaterial` MUST include the chunks:
   ```glsl
   // vertex
   #include <common>
   #include <logdepthbuf_pars_vertex>
   void main() {
     ...
     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
     #include <logdepthbuf_vertex>
   }
   // fragment
   #include <common>
   #include <logdepthbuf_pars_fragment>
   void main() {
     #include <logdepthbuf_fragment>
     ...
   }
   ```
2. r152 API only. Color textures: `tex.colorSpace = THREE.SRGBColorSpace`. Renderer uses `useLegacyLights = true`, `NoToneMapping`. Lighting: one PointLight at the sun + faint ambient (engine-owned — don't add lights).
3. Custom shading on lit bodies: prefer `MeshPhongMaterial`/`MeshLambertMaterial` (+ `onBeforeCompile` injection) over raw ShaderMaterial — you get log depth and sun lighting for free.
4. Transparent/additive objects: `depthWrite: false` + explicit `renderOrder`. Big point clouds / sky shells: `frustumCulled = false`.
5. No per-frame allocations in `onUpdate` — hoist temp Vector3s.
6. Procedural textures: build ONCE via canvas 2D at `ctx.quality.texSize` (512 low / 1024 high), `CanvasTexture`, `colorSpace = SRGBColorSpace`.
7. Budgets (high / low tier): sphere segments ≤ 64×48 / 40×28 (Earth may use 96×64 / 56×40); total points per module ≤ 45k×particleScale; keep each module ≤ ~25 draw calls.
8. No DOM access except via ctx helpers. No `import`/`export`, no fetch/XHR, no external URLs, no `Date.now` in shaders (use `state.t` uniform).

## Geo → 3D (monuments)

Standard three.js equirectangular mapping (matches the NASA earth textures):
```js
function latLonToVec3(latDeg, lonDeg, r) {
  var phi = (90 - latDeg) * Math.PI / 180;
  var theta = (lonDeg + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}
```
Objects glued to the ground must be children of `ctx.shared.earthSurface` (it spins; positions above are in its local space).

## Module specs

### mod_universe.js
Starfield shell (25k pts high tier × particleScale) between STARFIELD.rMin/rMax — temperature-tinted colors, size attenuation clamped ~[1, 4·dpr] px, subtle twinkle ok. Milky Way: particle disc + 6–10 soft nebula sprites (canvas radial gradients, teal/rose/amber), tilted ~60°, additive, centered on origin so it reads as a band across the sky. Distant galaxies: ~2000×particleScale sprites from 3 procedural canvas variants (spiral w/ arcs, elliptical blob, edge-on streak) scattered DEEPSKY.rMin–rMax, clustered along ~35 random line segments (cosmic-web filaments). Everything `frustumCulled=false`, fade nothing (distant stuff is sub-pixel up close anyway — cheap).

### mod_solar.js
Sun: sphere r109 (seg 64/40), emissive ShaderMaterial — 2-octave value-noise granulation drifting with `state.t`, limb darkening, white-yellow core → orange rim; + 2 additive corona sprites (canvas radial gradient) ~3–6× radius, slow pulse; + a far-visibility sprite whose scale ≈ dist×k so the Sun stays a visible star from anywhere (clamp so it never exceeds ~2.5× the sun's angular size when close). Planets EXCEPT Earth: spheres (seg 48×32 / 28×20), MeshPhongMaterial with canvas-procedural equirect textures — mercury cratered gray, venus creamy sulfur swirl, mars rust + dark maria + polar caps, jupiter banded + Great Red Spot, saturn soft bands, uranus pale cyan, neptune deep blue + faint storm. Apply axial `tilt`. Saturn ring: RingGeometry 1.24–2.27×r, canvas strip w/ Cassini gap, MeshBasicMaterial {transparent, DoubleSide, depthWrite false}. Fix ring UVs radially (RingGeometry UVs are planar — remap per-vertex: u = (len(pos.xy)-inner)/(outer-inner)). Moon: r 0.273, Lambert + `ctx.assets.moon`, position from `eph.moon`, tidally locked (face Earth). Orbit lines: LineLoop 160 seg per planet, color #26314d, transparent 0.35. Per frame: `mesh.position.copy(ctx.eph[name])`, spin `rotation.y += rate*dt*state.timeScale`. Name labels: text sprites above each planet, screen-constant size (scale ∝ dist), visible only when `state.labelsVisible` && angular size 0.5–60 px.

### mod_earth.js
Group hierarchy: `tiltGroup` (rotation.z = 23.4°) → `spinGroup` (rotation.y integrates day ≈ 120 s·timeScale) → meshes. `tiltGroup.position.copy(eph.earth)` per frame. **Publish `ctx.shared.earthSurface = spinGroup` at build time.** Earth mesh: sphere r1 seg 96×64 / 56×40, MeshPhongMaterial {map: earthDay, normalMap: earthNormal, specularMap: earthSpecular, specular #445566, shininess 18} + `onBeforeCompile`: inject night lights — sample earthNight, multiply by `smoothstep(0.05, -0.15, dot(worldNormal, sunDir))`, warm-orange tint ×1.4, add as emissive; pass `sunDir` uniform (world-space, update per frame from `eph.sun - eph.earth`, normalized — note world group offset cancels in direction math; use logical eph values). Terminator: slight orange tint where dot ≈ 0. Clouds: sphere r1.008, Lambert {map earthClouds, transparent, depthWrite false}, spins ~1.35× earth rate. Atmosphere rim: sphere r1.035, BackSide additive ShaderMaterial (log-depth chunks), fresnel glow #4d8fd9 fading to transparent — soft, thin, honest (the real atmosphere is 0.8% of the radius; keep the glow subtle at ≤3.5% with falloff). No focus registration (engine owns it).

### mod_exotic.js
**Black hole** at `eph.blackhole`: (a) event-horizon sphere r=holeRadius, pure black MeshBasicMaterial; (b) lensing billboard — a camera-facing plane ~7×diskOuter wide (use a Sprite-like quad updated to face camera, or Mesh + lookAt(0,0,0)-relative each frame): ShaderMaterial (log-depth chunks) drawing a procedural background starfield whose sample direction is radially warped by deflection `d' = d - k/d` → Einstein ring, stars smeared tangentially near the ring, black inside photon radius ~1.4×hole; (c) accretion disk — ring 1.4–4.5×hole radius, tilted ~18°, additive ShaderMaterial: doppler gradient (approaching limb blue-white ×3 brightness, receding dim red), inner edge hottest, fbm streaks advected azimuthally (`uv.x += t·ω(r)`), DoubleSide, depthWrite false. Slow disk precession. Label sprite: "BLACK HOLE — nothing below this surface can escape" (labelsVisible-gated). **Wormhole** at `eph.wormhole`: torus (radius, tube ≈ radius×0.16) iridescent shader or MeshPhongMaterial w/ shifting hue; inner disk ShaderMaterial — swirling fbm nebula (violet/teal), slight view-parallax; ~600 spiral particles falling inward. Transit: in onUpdate, if `state.camPos` within radius×0.5 of center → `ctx.flash('#eaf4ff', 260)` + `COSMOS.setFocusByName('saturn', {radiusMult: 5})` + `ctx.toast('Wormhole transit — an Ellis throat would connect distant regions. (Entirely hypothetical.)', 8000)`; cooldown 5 s. Label: "WORMHOLE — hypothetical (Ellis metric)". Both need far-visibility glint sprites (screen-clamped like the sun's, smaller).

### mod_monuments.js
Real features, true scale, glued to `ctx.shared.earthSurface` (children — local coords via latLonToVec3): Everest 8.849 (27.99, 86.93); K2 8.611 (35.88, 76.51); Kilimanjaro 5.895 (−3.07, 37.35); Denali 6.19 (63.07, −151.00); Mont Blanc 4.81 (45.83, 6.86); Burj Khalifa 0.828 (25.20, 55.27); Eiffel Tower 0.33 (48.86, 2.29); Great Pyramid 0.147 (29.98, 31.13); Grand Canyon −1.86 (36.06, −112.14); Dead Sea −0.43 (31.50, 35.50); Mariana Trench −10.935 (11.35, 142.20); Human 0.0017 (27.99, 86.94) label "You — 1.7 m". Heights are km — convert with `ctx.km()`. Up-features: thin cones (base r = height×0.35) apex-up, warm gray; down-features: inverted cones, deep blue, sunk below surface; human: tiny cylinder, warm white. Scale vertically by `state.exaggeration` each frame (anchor base at surface: position along normal = surfaceR + h·exag/2 for cones). At exaggeration 1 they're invisible from any distance — **that's the point** — at 75 they erupt. Labels: text sprites, screen-constant size (~14 px tall), shown when `state.labelsVisible` && `state.altitude < 0.35` && the feature faces the camera (dot(featureDir, camDir) > 0.15); include height in label text ("Everest · 8.8 km"). Also, once when `state.altitude` first drops below 0.05: `ctx.toast('Every marker here — every mountain, tower and trench that humans call vast — press E, then zoom out and watch them vanish.', 9000)`.

## Return value

Your final message: JSON only — `{"file": "js/mod_x.js", "status": "written", "notes": "<anything the integrator must know>"}`.
