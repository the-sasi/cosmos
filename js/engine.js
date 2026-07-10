/* ============================================================================
   COSMOS engine — scale system, floating origin, camera, focus, ephemeris, HUD
   ----------------------------------------------------------------------------
   Design: ONE scene, one camera, one continuous zoom.
   - The camera never leaves the origin. A root group ("world") is offset by
     minus the camera's logical position every frame. Object3D positions and
     matrices are computed in JS doubles, so precision is always highest at
     the camera — this is what keeps 5 km-over-Everest stable while the scene
     spans tens of millions of units.
   - One world unit = 1 Earth radius = 6,371 km. Object SIZES are true to
     ratio; orbital DISTANCES are compressed ("realistic, not real"). The HUD
     re-expands displayed widths through a calibrated log mapping so the
     numbers you read tell the true story.
   ========================================================================== */
(function () {
  'use strict';

  var KM_PER_UNIT = 6371;
  var LY_KM = 9.4607e12;
  var AU_KM = 1.496e8;

  // ---- world layout (compressed distances, true size ratios) ---------------
  var LAYOUT = {
    KM_PER_UNIT: KM_PER_UNIT,
    SUN: { radius: 109 },
    PLANETS: {
      mercury: { orbit: 800,   radius: 0.383, period: 88,    tilt: 0.03, label: 'Mercury' },
      venus:   { orbit: 1400,  radius: 0.949, period: 225,   tilt: 177,  label: 'Venus' },
      earth:   { orbit: 2000,  radius: 1.0,   period: 365,   tilt: 23.4, label: 'Earth' },
      mars:    { orbit: 2800,  radius: 0.532, period: 687,   tilt: 25.2, label: 'Mars' },
      jupiter: { orbit: 5200,  radius: 10.97, period: 4333,  tilt: 3.1,  label: 'Jupiter' },
      saturn:  { orbit: 8000,  radius: 9.14,  period: 10759, tilt: 26.7, label: 'Saturn' },
      uranus:  { orbit: 12000, radius: 3.98,  period: 30687, tilt: 97.8, label: 'Uranus' },
      neptune: { orbit: 16000, radius: 3.86,  period: 60190, tilt: 28.3, label: 'Neptune' }
    },
    MOON: { orbit: 60.3, radius: 0.273, period: 27.3 },
    // major moons of other planets (compressed orbits, near-true size ratios;
    // Enceladus nudged up for visibility). Periods are real days — the engine
    // slows them 12x so orbits read as motion, not blur.
    MOONS: {
      io:        { parent: 'jupiter', orbit: 18, radius: 0.286, period: 1.77, label: 'Io',        color: 0xd9c26a },
      europa:    { parent: 'jupiter', orbit: 24, radius: 0.245, period: 3.55, label: 'Europa',    color: 0xcfc4ae },
      ganymede:  { parent: 'jupiter', orbit: 31, radius: 0.413, period: 7.15, label: 'Ganymede',  color: 0x9a8f80 },
      callisto:  { parent: 'jupiter', orbit: 42, radius: 0.378, period: 16.7, label: 'Callisto',  color: 0x6f6a62 },
      titan:     { parent: 'saturn',  orbit: 30, radius: 0.404, period: 15.9, label: 'Titan',     color: 0xc9973f },
      enceladus: { parent: 'saturn',  orbit: 14, radius: 0.06,  period: 1.37, label: 'Enceladus', color: 0xe8eef2 },
      triton:    { parent: 'neptune', orbit: 16, radius: 0.212, period: 5.88, label: 'Triton',    color: 0xb8a8a2 }
    },
    BLACKHOLE: { pos: [90000, 9000, -62000], holeRadius: 20, diskOuter: 90 },
    WORMHOLE: { pos: [-72000, -6000, 108000], radius: 40 },
    STARFIELD: { rMin: 250000, rMax: 900000 },
    GALAXY: { radius: 1400000, thickness: 90000 },
    DEEPSKY: { rMin: 5.0e6, rMax: 2.8e7 },
    CAM_MAX: 5.5e7
  };

  var EARTH_YEAR_SECONDS = 300; // one compressed Earth year of animation time

  // ---- module registry ------------------------------------------------------
  var registry = [];
  var COSMOS = {
    LAYOUT: LAYOUT,
    register: function (name, build) { registry.push({ name: name, build: build }); },
    // multiverse: a universe is pure data — {id, name, tagline, accent, camMax,
    // facts, build(ctx, group, registerFocus)}. No engine changes to add one.
    _universeDefs: [],
    registerUniverse: function (def) { this._universeDefs.push(def); },
    eph: {},         // name -> THREE.Vector3 (logical positions, stable instances)
    shared: {},      // cross-module handles (earth module publishes earthSurface here)
    util: {}
  };
  window.COSMOS = COSMOS;

  // ---- tiny helpers ---------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function el(id) { return document.getElementById(id); }

  window.onerror = function (msg, src, line) {
    var e = el('err'); if (!e) return;
    e.style.display = 'block';
    e.textContent = msg + ' @ ' + String(src).split('/').pop() + ':' + line;
  };

  // ============================================================================
  // boot
  // ============================================================================
  COSMOS.boot = function () {
    var THREE = window.THREE;
    var canvas = el('scene');
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: true, logarithmicDepthBuffer: true,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      el('loading').classList.add('gone');
      el('nogl').style.display = 'flex';
      return;
    }

    // ---- quality tier -------------------------------------------------------
    var isMobile = window.matchMedia('(pointer: coarse)').matches ||
                   /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    var quality = {
      tier: isMobile ? 'low' : 'high',
      isMobile: isMobile,
      particleScale: isMobile ? 0.35 : 1.0,
      texSize: isMobile ? 512 : 1024
    };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.tier === 'low' ? 1.6 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.useLegacyLights = true;
    renderer.setClearColor(0x000004, 1);

    var scene = new THREE.Scene();
    var world = new THREE.Group();          // floating-origin root
    world.name = 'world';
    scene.add(world);

    var FOV = 50;
    var camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 2e-5, 1.2e8);
    camera.position.set(0, 0, 0);
    scene.add(camera);

    // lights: the Sun, plus a whisper of ambient so night sides aren't void
    var sunLight = new THREE.PointLight(0xfff4e5, 1.6, 0, 2);
    sunLight.decay = 0;
    world.add(sunLight);
    scene.add(new THREE.AmbientLight(0x202636, 0.35));

    // ---- ephemeris ----------------------------------------------------------
    var eph = COSMOS.eph;
    var angles = { mercury: 0.9, venus: 2.3, earth: 0.55, mars: 4.1, jupiter: 1.15,
                   saturn: 2.95, uranus: 5.25, neptune: 3.85, moon: 1.2 };
    eph.sun = new THREE.Vector3(0, 0, 0);
    Object.keys(LAYOUT.PLANETS).forEach(function (k) { eph[k] = new THREE.Vector3(); });
    eph.moon = new THREE.Vector3();
    Object.keys(LAYOUT.MOONS).forEach(function (k, i) {
      eph[k] = new THREE.Vector3();
      angles[k] = i * 1.7 + 0.4;
    });
    eph.blackhole = new THREE.Vector3().fromArray(LAYOUT.BLACKHOLE.pos);
    eph.wormhole = new THREE.Vector3().fromArray(LAYOUT.WORMHOLE.pos);

    function updateEphemeris(dts) {
      Object.keys(LAYOUT.PLANETS).forEach(function (k) {
        var p = LAYOUT.PLANETS[k];
        angles[k] += (Math.PI * 2 * 365 / (EARTH_YEAR_SECONDS * p.period)) * dts;
        eph[k].set(Math.cos(angles[k]) * p.orbit, 0, Math.sin(angles[k]) * p.orbit);
      });
      angles.moon += (Math.PI * 2 * 365 / (EARTH_YEAR_SECONDS * LAYOUT.MOON.period)) * dts;
      eph.moon.set(
        eph.earth.x + Math.cos(angles.moon) * LAYOUT.MOON.orbit,
        eph.earth.y + Math.sin(angles.moon) * LAYOUT.MOON.orbit * 0.09,
        eph.earth.z + Math.sin(angles.moon) * LAYOUT.MOON.orbit
      );
      Object.keys(LAYOUT.MOONS).forEach(function (k) {
        var m = LAYOUT.MOONS[k];
        angles[k] += (Math.PI * 2 * 365 / (EARTH_YEAR_SECONDS * m.period * 12)) * dts;
        var pp = eph[m.parent];
        eph[k].set(
          pp.x + Math.cos(angles[k]) * m.orbit,
          pp.y + Math.sin(angles[k]) * m.orbit * 0.05,
          pp.z + Math.sin(angles[k]) * m.orbit
        );
      });
    }
    updateEphemeris(0);

    // ---- focusables ---------------------------------------------------------
    var focusables = {};
    var realms = {};                 // id -> {group, def}
    var realmHome = { observable: 'sun' };
    var realmNavLists = { observable: ['sun', 'mercury', 'venus', 'earth', 'moon',
      'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'blackhole', 'wormhole'] };
    function addFocus(f) {
      f.minAlt = f.minAlt !== undefined ? f.minAlt : Math.max(f.radius * 0.02, 8e-4);
      f.realm = f.realm || 'observable';
      focusables[f.name] = f;
    }
    function camMax() {
      var r = realms[state.realm];
      return (r && r.def.camMax) || LAYOUT.CAM_MAX;
    }
    addFocus({ name: 'sun', label: 'The Sun', radius: LAYOUT.SUN.radius, minAlt: 40, parent: null,
               getPosition: function () { return eph.sun; } });
    Object.keys(LAYOUT.PLANETS).forEach(function (k) {
      var p = LAYOUT.PLANETS[k];
      addFocus({ name: k, label: p.label, radius: p.radius, parent: 'sun',
                 minAlt: k === 'earth' ? 2.5e-4 : Math.max(p.radius * 0.012, 1e-3),
                 getPosition: function () { return eph[k]; } });
    });
    addFocus({ name: 'moon', label: 'The Moon', radius: LAYOUT.MOON.radius, parent: 'earth',
               minAlt: 6e-4, getPosition: function () { return eph.moon; } });
    Object.keys(LAYOUT.MOONS).forEach(function (k) {
      var m = LAYOUT.MOONS[k];
      addFocus({ name: k, label: m.label, radius: m.radius, parent: m.parent,
                 minAlt: Math.max(m.radius * 0.05, 5e-4),
                 getPosition: function () { return eph[k]; } });
    });
    addFocus({ name: 'blackhole', label: 'Black Hole', radius: LAYOUT.BLACKHOLE.holeRadius,
               minAlt: 120, parent: 'sun', warn: 'gravitationally lensed — light bends around it',
               getPosition: function () { return eph.blackhole; } });
    addFocus({ name: 'wormhole', label: 'Wormhole', radius: LAYOUT.WORMHOLE.radius,
               minAlt: 14, parent: 'sun', warn: 'HYPOTHETICAL — no wormhole has ever been observed',
               getPosition: function () { return eph.wormhole; } });

    // ---- camera state -------------------------------------------------------
    var cam = {
      focus: focusables.sun,
      theta: 0.65, phi: 1.12, radius: 2.6e7,
      thetaT: 0.65, phiT: 1.12, radiusT: 2.6e7
    };
    var flight = null;          // {to, t0, dur, r0, r1, fromName}
    var firstInput = false;
    var lastRetarget = -10;

    var camPos = new THREE.Vector3();       // logical camera position (doubles)
    var focusPos = new THREE.Vector3();     // current (possibly in-flight) focus position
    var tmpV = new THREE.Vector3();
    var tmpV2 = new THREE.Vector3();
    var camFwd = new THREE.Vector3();

    // ---- live state exposed to modules --------------------------------------
    var state = {
      t: 0, dt: 0, timeScale: 1,
      realm: 'observable',
      exaggeration: 1, exagTarget: 1,
      labelsVisible: true,
      camPos: camPos,
      focusName: 'sun', focusLabel: 'The Sun',
      camDist: cam.radius, altitude: 0, viewWidthUnits: 0, viewKm: 0,
      camOriginDist: 0,
      pixelsPerUnit: function (dist) {
        return (renderer.domElement.clientHeight * 0.5) /
               (Math.tan(FOV * Math.PI / 360) * Math.max(dist, 1e-9));
      }
    };

    // ---- ctx handed to modules ----------------------------------------------
    var updaters = [];
    var clickHooks = [];
    var ctx = {
      THREE: THREE, renderer: renderer, camera: camera, world: world,
      layout: LAYOUT, eph: eph, state: state, quality: quality,
      shared: COSMOS.shared,
      assets: {},                            // filled after texture load
      km: function (km) { return km / KM_PER_UNIT; },
      onUpdate: function (fn) { updaters.push(fn); },
      onClick: function (fn) { clickHooks.push(fn); },   // return true to consume
      addFact: function (name, text) { FOCUS_FACTS[name] = text; },
      addNav: function (name) { realmNavLists.observable.push(name); },
      registerFocus: addFocus,
      makeTextSprite: makeTextSprite,
      toast: showToast,
      flash: doFlash,
      showInfo: showInfo,
      hideInfo: hideInfo,
      projectToScreen: function (pos, out) { return projectToScreen(pos, out); }
    };

    // ---- info panel (monument dives, place details) ---------------------------
    var infoEl = el('hud-info');
    var infoOpen = false;
    function showInfo(html) {
      if (!infoEl) return;
      infoEl.innerHTML = '<button class="x" aria-label="close">×</button>' + html;
      infoEl.classList.add('show');
      infoOpen = true;
      infoEl.querySelector('.x').addEventListener('click', hideInfo);
    }
    function hideInfo() {
      if (!infoEl) return;
      infoEl.classList.remove('show');
      infoOpen = false;
    }

    // ---- text sprite helper ---------------------------------------------------
    function makeTextSprite(text, opts) {
      opts = opts || {};
      var fontPx = opts.fontPx || 44;
      var c = document.createElement('canvas');
      var g = c.getContext('2d');
      g.font = '600 ' + fontPx + 'px system-ui, sans-serif';
      var w = Math.ceil(g.measureText(text).width) + 24;
      var h = fontPx + 20;
      c.width = w; c.height = h;
      g = c.getContext('2d');
      g.font = '600 ' + fontPx + 'px system-ui, sans-serif';
      g.textBaseline = 'middle';
      if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
      g.shadowColor = 'rgba(0,0,10,0.9)'; g.shadowBlur = 8;
      g.fillStyle = opts.color || '#dfe7f4';
      g.fillText(text, 12, h / 2);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      var m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
      var s = new THREE.Sprite(m);
      s.userData.aspect = w / h;
      s.renderOrder = 50;
      return s;
    }
    COSMOS.util.makeTextSprite = makeTextSprite;

    // ---- HUD ------------------------------------------------------------------
    var hudName = el('hud-name'), hudCaption = el('hud-caption'), hudScale = el('hud-scale');
    var nameN = hudName.children[0], nameD = hudName.children[1], nameW = hudName.children[2];
    var scaleW = hudScale.children[0], scaleRef = hudScale.children[2];

    // display mapping: view width in units -> "storytelling" km.
    // Honest below 300 units; log-interpolated through anchors beyond, so the
    // compressed layout still reads out the real universe.
    var ANCHORS = [
      [300,   300 * KM_PER_UNIT],   // honest handoff (~1.9 million km)
      [3.2e4, 9.0e9],               // solar system frame -> ~60 AU
      [1.8e6, 4.0 * LY_KM],         // starfield -> nearest stars
      [3.2e6, 1.0e5 * LY_KM],       // galaxy frame -> Milky Way width
      [6.0e7, 9.3e10 * LY_KM]       // deep sky -> observable universe
    ];
    function displayKm(units) {
      if (units <= ANCHORS[0][0]) return units * KM_PER_UNIT;
      for (var i = 0; i < ANCHORS.length - 1; i++) {
        var a = ANCHORS[i], b = ANCHORS[i + 1];
        if (units <= b[0]) {
          var t = (Math.log(units) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]));
          return Math.exp(lerp(Math.log(a[1]), Math.log(b[1]), t));
        }
      }
      return ANCHORS[ANCHORS.length - 1][1];
    }
    function fmtKm(km) {
      if (km < 1) return Math.round(km * 1000).toLocaleString('en-US') + ' m';
      if (km < 100) return km.toFixed(1) + ' km';
      if (km < 1e6) return Math.round(km).toLocaleString('en-US') + ' km';
      if (km < AU_KM * 0.6) return (km / 1e6).toFixed(1) + ' million km';
      if (km < LY_KM * 0.08) return (km / AU_KM).toFixed(1) + ' AU';
      if (km < LY_KM * 1e3) return (km / LY_KM).toFixed(km < LY_KM * 10 ? 1 : 0) + ' light-years';
      if (km < LY_KM * 1e6) return Math.round(km / LY_KM / 1e3).toLocaleString('en-US') + ' thousand ly';
      if (km < LY_KM * 1e9) return (km / LY_KM / 1e6).toFixed(1) + ' million ly';
      return (km / LY_KM / 1e9).toFixed(1) + ' billion ly';
    }
    var REFS = [
      [0.0017, 'a human'],
      [0.828, 'the Burj Khalifa'],
      [8.8, 'the height of Everest'],
      [446, 'the length of the Grand Canyon'],
      [3476, "the Moon's diameter"],
      [12742, "Earth's diameter"],
      [384400, 'the Earth–Moon distance'],
      [1.39e6, "the Sun's diameter"],
      [AU_KM, 'the Earth–Sun distance'],
      [4.5e9, "Neptune's orbit radius"],
      [LY_KM, 'one light-year'],
      [4.13e13, 'the distance to Proxima Centauri'],
      [1e5 * LY_KM, 'the width of the Milky Way'],
      [2.5e6 * LY_KM, 'the distance to Andromeda'],
      [9.3e10 * LY_KM, 'the observable universe']
    ];
    function refLine(km) {
      var pick = REFS[0];
      for (var i = 0; i < REFS.length; i++) if (REFS[i][0] <= km) pick = REFS[i];
      var n = km / pick[0];
      var ns = n >= 9.5 ? Math.round(n).toLocaleString('en-US') : (n < 1.05 && n > 0.95 ? '1' : n.toFixed(1));
      return '≈ ' + ns + ' × ' + pick[1];
    }

    // narrative captions per scale band (keyed on displayed km);
    // a third element restricts the caption to one focus body
    var EHINT = quality.isMobile ? 'Tap the ⛰ terrain button' : 'Press E';
    var BANDS = [
      [0,        'That marker is a person — 1.7 m tall. Remember this size. It will vanish almost immediately.', 'earth'],
      [30,       'Everest rises 8.8 km. The Mariana Trench drops 10.9 km. Together: 0.155% of Earth\'s diameter. ' + EHINT + ' to see why you can\'t see them.', 'earth'],
      [3000,     'Earth — 12,742 km across. At this scale it is smoother than a billiard ball. Every mountain has vanished.', 'earth'],
      [8e4,      'The Moon orbits 30 Earth-diameters out. All seven other planets would fit in the gap, side by side.'],
      [2e6,      'The Sun — 109 Earths wide. 1.3 million Earths would fit inside it.'],
      [5e8,      'Interplanetary space is almost perfectly empty. Sunlight takes 4 hours to reach Neptune; it reached you in 8 minutes.'],
      [9.46e10,  'You have left the solar system. The nearest star is 4.2 light-years away — Voyager 1 would need 70,000 years.'],
      [9.46e13,  'Nearly every star here carries planets. The Milky Way holds around 400 billion stars. You have stood on one planet of one of them.'],
      [4.7e16,   'The Milky Way — 100,000 light-years across. Light leaving one edge tonight arrives when humanity is long transformed.'],
      [9.46e18,  'Galaxies outnumber every human who has ever lived. Each dot here is hundreds of billions of suns.'],
      [9.46e21,  'The observable universe — 93 billion light-years. This is everything anyone can ever see. You know where home is.']
    ];
    var bandIdx = -1, bandPendIdx = -1, bandPendAt = 0, toastTimer = 0;
    function showToast(text, ms) {
      hudCaption.textContent = text;
      hudCaption.classList.add('show');
      toastTimer = state.t + (ms || 7000) / 1000;
    }
    function doFlash(color, ms) {
      var f = el('flash');
      f.style.background = color || '#fff';
      f.style.opacity = '0.9';
      setTimeout(function () { f.style.opacity = '0'; }, ms || 180);
    }

    // ---- input ----------------------------------------------------------------
    var pointers = {};          // id -> {x, y}
    var pinchDist = 0;
    var downInfo = null;
    var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var ROT = 0.0052;

    function markInput() {
      if (!firstInput) { firstInput = true; el('intro').classList.add('gone'); }
    }
    function numPointers() { return Object.keys(pointers).length; }

    canvas.addEventListener('pointerdown', function (e) {
      markInput();
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      canvas.classList.add('dragging');
      if (numPointers() === 1) downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      else downInfo = null;
      if (numPointers() === 2) {
        var ids = Object.keys(pointers);
        pinchDist = Math.hypot(pointers[ids[0]].x - pointers[ids[1]].x,
                               pointers[ids[0]].y - pointers[ids[1]].y);
      } else if (numPointers() > 2) pinchDist = 0;
    });
    canvas.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      var p = pointers[e.pointerId];
      if (!p) return;
      // self-heal: a mouse "drag" with no button held is a leaked pointer
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        delete pointers[e.pointerId];
        pinchDist = 0;
        if (numPointers() === 0) { canvas.classList.remove('dragging'); downInfo = null; }
        return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
      if (numPointers() === 1) {
        cam.thetaT -= dx * ROT;
        cam.phiT = clamp(cam.phiT - dy * ROT, 0.03, Math.PI - 0.03);
      } else if (numPointers() === 2) {
        var ids = Object.keys(pointers);
        var d = Math.hypot(pointers[ids[0]].x - pointers[ids[1]].x,
                           pointers[ids[0]].y - pointers[ids[1]].y);
        if (pinchDist > 0 && d > 0) {
          zoomBy(pinchDist / d);
          var mx = (pointers[ids[0]].x + pointers[ids[1]].x) / 2;
          var my = (pointers[ids[0]].y + pointers[ids[1]].y) / 2;
          mouse.x = mx; mouse.y = my;
        }
        pinchDist = d;
      }
    });
    function endPointer(e) {
      // a cancelled pointer (OS gesture, incoming call) is never a click
      var wasClick = e.type === 'pointerup' && downInfo && numPointers() === 1 &&
                     performance.now() - downInfo.t < 350 && downInfo.moved < 8;
      delete pointers[e.pointerId];
      if (numPointers() === 2) {
        // 3→2 finger transition: reseed for the surviving pair, or the next
        // move computes a zoom from a stale distance and the view lurches
        var ids = Object.keys(pointers);
        pinchDist = Math.hypot(pointers[ids[0]].x - pointers[ids[1]].x,
                               pointers[ids[0]].y - pointers[ids[1]].y);
      } else pinchDist = 0;
      if (numPointers() === 0) canvas.classList.remove('dragging');
      if (wasClick) handleClick(e.clientX, e.clientY);
      if (numPointers() === 0) downInfo = null;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    // belt and braces: never let a missed pointerup wedge the controls
    canvas.addEventListener('lostpointercapture', function (e) {
      delete pointers[e.pointerId];
      if (numPointers() < 2) pinchDist = 0;
      if (numPointers() === 0) canvas.classList.remove('dragging');
    });
    window.addEventListener('pointerup', function (e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      if (numPointers() < 2) pinchDist = 0;
      if (numPointers() === 0) { canvas.classList.remove('dragging'); downInfo = null; }
    });
    window.addEventListener('blur', function () {
      pointers = {};
      pinchDist = 0;
      downInfo = null;
      canvas.classList.remove('dragging');
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      markInput();
      mouse.x = e.clientX; mouse.y = e.clientY;
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;
      dy = clamp(dy, -220, 220);
      zoomBy(Math.exp(dy * 0.0016));
    }, { passive: false });

    function zoomBy(factor) {
      if (flight) {
        // user takes the stick mid-flight: commit the destination and re-anchor
        // around it seamlessly — never snap back to the departed body
        var tgt = flight.to;
        flight = null;
        setFocusSeamless(tgt);
      }
      cam.radiusT = clamp(cam.radiusT * factor,
                          cam.focus.radius + cam.focus.minAlt, camMax());
      if (factor < 1) tryRetarget();
    }

    // project a logical position; returns {x, y, front, dist} in CSS pixels
    function projectToScreen(pos, out) {
      tmpV.copy(pos).sub(camPos);
      var dist = tmpV.length();
      camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      var front = tmpV.dot(camFwd) > 0;
      tmpV.project(camera);
      out.x = (tmpV.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
      out.y = (-tmpV.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
      out.front = front; out.dist = dist;
      return out;
    }
    var scr = { x: 0, y: 0, front: false, dist: 0 };

    // selection gate: only bodies of the universe you're in, and in the
    // Observable Universe only once you've entered the solar neighborhood.
    function selectable(f) {
      if (f.realm !== state.realm) return false;
      if (f.beacon) return true;              // galaxies answer from any distance
      if (state.realm === 'observable' && state.viewWidthUnits > 8e5) return f.name === 'sun';
      return true;
    }

    // scroll-into-what-you-point-at: retarget focus while zooming in
    function tryRetarget() {
      if (state.t - lastRetarget < 0.7) return;
      var best = null, bestD = 56;
      for (var k in focusables) {
        var f = focusables[k];
        if (f === cam.focus || !selectable(f)) continue;
        projectToScreen(f.getPosition(), scr);
        if (!scr.front) continue;
        var px = state.pixelsPerUnit(scr.dist) * f.radius;
        if (px < 1.2) continue;
        var d = Math.hypot(scr.x - mouse.x, scr.y - mouse.y);
        var reach = Math.max(bestD, Math.min(px, 130));
        if (d < reach) { best = f; bestD = d; }
      }
      if (best) { lastRetarget = state.t; setFocusSeamless(best); showFocusFact(best.name); }
    }

    // click / tap → travel
    function handleClick(x, y) {
      for (var h = 0; h < clickHooks.length; h++) {
        try { if (clickHooks[h](x, y)) return; } catch (e) { /* keep input alive */ }
      }
      var best = null, bestD = 1e9;
      for (var k in focusables) {
        var f = focusables[k];
        if (!selectable(f)) continue;
        projectToScreen(f.getPosition(), scr);
        if (!scr.front) continue;
        var px = state.pixelsPerUnit(scr.dist) * f.radius;
        var d = Math.hypot(scr.x - x, scr.y - y);
        if (d < Math.max(px * 1.2, 22) && d < bestD) { best = f; bestD = d; }
      }
      if (best && best !== cam.focus) flyTo(best);
      else if (best && cam.radius > best.radius * 8) flyTo(best);   // re-frame only from far away
    }

    // re-anchor orbit to a new focus without moving the camera at all
    function setFocusSeamless(f) {
      tmpV2.copy(camPos).sub(f.getPosition());
      var r = Math.max(tmpV2.length(), f.radius + f.minAlt);
      var ratio = cam.radiusT / cam.radius;
      cam.focus = f;
      cam.radius = r;
      cam.radiusT = clamp(r * ratio, f.radius + f.minAlt, LAYOUT.CAM_MAX);
      cam.phi = cam.phiT = Math.acos(clamp(tmpV2.y / r, -1, 1));
      cam.theta = cam.thetaT = Math.atan2(tmpV2.x, tmpV2.z);
      state.focusName = f.name; state.focusLabel = f.label;
    }

    // arrive over the sunlit face, offset for a cinematic 3/4 lighting angle
    function sunSideAngles(f) {
      if (f.name === 'sun') return null;
      if (f.realm && f.realm !== 'observable') return null;   // realms light themselves
      tmpV2.copy(eph.sun).sub(f.getPosition()).normalize();
      return {
        theta: Math.atan2(tmpV2.x, tmpV2.z) + 0.55,
        phi: clamp(Math.acos(clamp(tmpV2.y, -1, 1)) - 0.18, 0.35, Math.PI - 0.35)
      };
    }
    function nearestAngle(cur, target) {
      var d = (target - cur) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return cur + d;
    }

    // one-shot arrival facts per body — these outrank the scale-band captions
    var FOCUS_FACTS = {
      sun: 'The Sun fuses 600 million tonnes of hydrogen every second. It is 8 light-minutes from home.',
      mercury: 'Mercury: a year lasts 88 days, but sunrise to sunrise takes 176 — its day is longer than its year.',
      venus: 'Venus spins backwards, under clouds of sulfuric acid. Its surface is hot enough to melt lead.',
      earth: 'Home. Every human who has ever lived, lived here.',
      mars: 'Mars hosts Olympus Mons — a volcano 22 km tall. Two and a half Everests, stacked.',
      jupiter: 'Jupiter could swallow 1,321 Earths. The Great Red Spot is a storm wider than our whole planet.',
      saturn: "Saturn's rings span 280,000 km — yet in places they are only about 10 metres thick.",
      uranus: 'Uranus rolls on its side, its axis tipped 98° — its seasons last 21 years each.',
      neptune: 'Neptune: winds of 2,100 km/h, the fastest in the solar system — powered by almost no sunlight.',
      moon: 'The Moon drifts 3.8 cm farther from Earth every year. Twelve people have stood on it.',
      blackhole: 'Below the horizon, every path through spacetime points inward. Nothing that falls in — not even light — returns.',
      wormhole: 'A shortcut through spacetime — mathematically consistent, never observed. Fly into the throat.'
    };
    var factShown = {};
    var suppressBandUntil = 0;
    function showFocusFact(name, delayGuard) {
      var fact = FOCUS_FACTS[name];
      if (!fact || factShown[name]) return;
      factShown[name] = true;
      suppressBandUntil = state.t + (delayGuard || 0) + 4;
      showToast(fact, 9000);
    }

    function flyTo(f) {
      var r1 = Math.max(f.radius * 3.6, f.radius + f.minAlt);
      // depart from the camera's CURRENT virtual focus (mid-flight included),
      // never from the stale focus object — no backwards snap on redirects
      flight = { fromPos: focusPos.clone(), fromName: cam.focus.name,
                 to: f, t0: state.t, dur: 2.1, r0: cam.radius, r1: r1 };
      var a = sunSideAngles(f);
      if (a) {
        cam.thetaT = nearestAngle(cam.theta, a.theta);
        cam.phiT = a.phi;
      }
      state.focusName = f.name; state.focusLabel = f.label;
      showFocusFact(f.name, flight.dur);
    }
    COSMOS.flyTo = function (name) { if (focusables[name]) flyTo(focusables[name]); };
    // dive the camera to hover above a point on Earth's surface.
    // worldDir: unit vector from Earth's centre (world space), alt: units above ground
    COSMOS.focusEarthPoint = function (worldDir, alt) {
      var f = focusables.earth; if (!f) return;
      markInput();
      flight = null;
      cam.focus = f;
      cam.radiusT = Math.max(f.radius + alt, f.radius + f.minAlt);
      cam.phiT = clamp(Math.acos(clamp(worldDir.y, -1, 1)), 0.03, Math.PI - 0.03);
      cam.thetaT = nearestAngle(cam.theta, Math.atan2(worldDir.x, worldDir.z));
      state.focusName = f.name; state.focusLabel = f.label;
    };
    COSMOS.setFocusByName = function (name, opts) {
      var f = focusables[name]; if (!f) return;
      opts = opts || {};
      markInput();                       // programmatic navigation ends the intro drift
      cam.focus = f;
      var r = (opts.radiusMult || 4) * f.radius;
      cam.radius = cam.radiusT = Math.max(r, f.radius + f.minAlt);
      var a = sunSideAngles(f);
      if (a) { cam.theta = cam.thetaT = a.theta; cam.phi = cam.phiT = a.phi; }
      state.focusName = f.name; state.focusLabel = f.label;
      if (!opts.quiet) showFocusFact(f.name);   // quiet: don't consume one-shot facts
      flight = null;
    };

    // ---- keys & buttons ---------------------------------------------------------
    var btnExag = el('btn-exag'), btnLabels = el('btn-labels');
    function toggleExag() {
      state.exagTarget = state.exagTarget > 1 ? 1 : 75;
      btnExag.classList.toggle('on', state.exagTarget > 1);
      btnExag.textContent = state.exagTarget > 1 ? '⛰ terrain ×75' : '⛰ terrain ×1';
      showToast(state.exagTarget > 1
        ? 'Terrain exaggerated 75× — this is the Earth your imagination expects.'
        : 'True scale restored. The mountains are still there. They are just honest now.', 5000);
    }
    function toggleLabels() {
      state.labelsVisible = !state.labelsVisible;
      btnLabels.classList.toggle('on', state.labelsVisible);
    }
    btnExag.addEventListener('click', function () { markInput(); toggleExag(); });
    btnLabels.addEventListener('click', function () { markInput(); toggleLabels(); });

    // destinations bar: one tap flies anywhere in the universe you're in
    var navEl = el('hud-nav');
    var navBtns = {};
    function rebuildNav(realmId) {
      if (!navEl) return;
      navEl.innerHTML = '';
      navBtns = {};
      (realmNavLists[realmId] || []).forEach(function (n) {
        var f = focusables[n]; if (!f) return;
        var b = document.createElement('button');
        b.textContent = f.label.replace('The ', '');
        b.addEventListener('click', function () { markInput(); flyTo(f); });
        navEl.appendChild(b);
        navBtns[n] = b;
      });
    }
    rebuildNav('observable');

    // ---- multiverse atlas + travel -------------------------------------------
    var atlasEl = el('atlas-panel'), atlasBtn = el('btn-atlas');
    var atlasOpen = false;
    function toggleAtlas(force) {
      atlasOpen = force !== undefined ? force : !atlasOpen;
      if (atlasEl) atlasEl.classList.toggle('show', atlasOpen);
      if (atlasBtn) atlasBtn.classList.toggle('on', atlasOpen);
    }
    function buildAtlas() {
      if (!atlasEl) return;
      atlasEl.innerHTML = '';
      Object.keys(realms).forEach(function (id) {
        var def = realms[id].def;
        var b = document.createElement('button');
        b.className = 'uni';
        b.innerHTML = '<span class="dot" style="background:' + def.accent + '"></span>' +
          '<span class="un">' + def.name + '</span><span class="ut">' + def.tagline + '</span>';
        b.addEventListener('click', function () { COSMOS.enterUniverse(id); });
        atlasEl.appendChild(b);
      });
    }
    if (atlasBtn) atlasBtn.addEventListener('click', function () { markInput(); toggleAtlas(); });

    function applyAccent(color) {
      document.documentElement.style.setProperty('--acc', color || '#c8d4ec');
    }

    COSMOS.enterUniverse = function (id) {
      var target = realms[id];
      if (!target || id === state.realm) { toggleAtlas(false); return; }
      markInput();
      toggleAtlas(false);
      hideInfo();
      doFlash('#eef3ff', 800);
      setTimeout(function () {
        if (realms[state.realm]) realms[state.realm].group.visible = false;
        state.realm = id;
        target.group.visible = true;
        var f = focusables[realmHome[id]] || cam.focus;
        flight = null;
        cam.focus = f;
        cam.radius = cam.radiusT = Math.max(f.radius * 9, f.radius + f.minAlt);
        cam.theta = cam.thetaT = 0.6;
        cam.phi = cam.phiT = 1.1;
        state.focusName = f.name; state.focusLabel = f.label;
        applyAccent(target.def.accent);
        rebuildNav(id);
        bandIdx = -1;
        suppressBandUntil = state.t + 6;
        showToast(target.def.arrive || ('You have crossed into ' + target.def.name + '.'), 8000);
      }, 320);
    };
    window.addEventListener('keydown', function (e) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'e' || e.key === 'E') { markInput(); toggleExag(); }
      if (e.key === 'l' || e.key === 'L') { markInput(); toggleLabels(); }
    });

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ---- texture loading ----------------------------------------------------------
    function loadTextures() {
      var loader = new THREE.TextureLoader();
      var srgb = { earthDay: 1, earthNight: 1, earthClouds: 1, moon: 1 };
      var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      var jobs = [];
      function queue(bundle, allSrgb) {
        Object.keys(bundle || {}).forEach(function (n) {
          jobs.push(new Promise(function (resolve) {
            loader.load(bundle[n], function (tex) {
              if (allSrgb || srgb[n]) tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = aniso;
              ctx.assets[n] = tex;
              resolve();
            }, undefined, function () { resolve(); }); // missing texture: modules cope
          }));
        });
      }
      queue(window.COSMOS_ASSETS, false);
      queue(window.COSMOS_ASSETS2, true);              // planet imagery: all color data
      return Promise.all(jobs);
    }

    // ---- main loop ------------------------------------------------------------------
    var clock = new THREE.Clock();
    var hudAccum = 0;

    function frame() {
      requestAnimationFrame(frame);
      var dt = clamp(clock.getDelta(), 0, 0.05);
      state.dt = dt;
      state.t += dt;

      // time slows as you approach any surface, so worlds don't spin under you
      var altR = Math.max(state.altitude, 1e-9) / cam.focus.radius;
      var tsTarget = clamp((altR - 0.25) / 6, 0.03, 1);
      state.timeScale += (tsTarget - state.timeScale) * (1 - Math.exp(-dt * 2.2));
      updateEphemeris(dt * state.timeScale);

      // exaggeration eases toward its target
      state.exaggeration += (state.exagTarget - state.exaggeration) * (1 - Math.exp(-dt * 5));

      // gentle cinematic drift until the first input (never pushes the radius UP)
      if (!firstInput && cam.radiusT > 1.6e6) cam.radiusT *= Math.exp(-dt * 0.05);

      // flight animation
      if (flight) {
        var ft = clamp((state.t - flight.t0) / flight.dur, 0, 1);
        var e = smooth01(ft);
        focusPos.copy(flight.fromPos).lerp(flight.to.getPosition(), e);
        // arc over the Sun when the straight chord would dive through it
        var dS = focusPos.length();
        if (dS < 800 && flight.to.name !== 'sun' && flight.fromName !== 'sun') {
          focusPos.y += (800 - dS) * Math.sin(Math.PI * e);
        }
        cam.radius = Math.exp(lerp(Math.log(flight.r0), Math.log(flight.r1), e));
        cam.radiusT = cam.radius;
        if (ft >= 1) {
          cam.focus = flight.to;
          flight = null;
        }
      } else {
        focusPos.copy(cam.focus.getPosition());
        // zoom-out past the neighborhood → hand focus to the parent, seamlessly
        var f = cam.focus;
        if (f.parent && focusables[f.parent]) {
          var par = focusables[f.parent];
          var switchAt = Math.max(40 * f.radius,
            0.7 * tmpV.copy(f.getPosition()).sub(par.getPosition()).length());
          // only while actually zooming OUTWARD — otherwise a fresh zoom-in
          // retarget onto a child would be reverted on the very same frame
          if (cam.radiusT > switchAt && cam.radiusT >= cam.radius) setFocusSeamless(par);
        }
        var minR = cam.focus.radius + cam.focus.minAlt;
        cam.radiusT = clamp(cam.radiusT, minR, camMax());
      }

      // damped follow
      var kr = 1 - Math.exp(-dt * 6), ka = 1 - Math.exp(-dt * 10);
      cam.radius += (cam.radiusT - cam.radius) * kr;
      cam.theta += (cam.thetaT - cam.theta) * ka;
      cam.phi += (cam.phiT - cam.phi) * ka;

      // logical camera position (doubles), spherical around focus
      var sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
      camPos.set(
        focusPos.x + cam.radius * sp * Math.sin(cam.theta),
        focusPos.y + cam.radius * cp,
        focusPos.z + cam.radius * sp * Math.cos(cam.theta)
      );

      // floating origin: world moves, camera stays home
      world.position.set(-camPos.x, -camPos.y, -camPos.z);
      tmpV.copy(focusPos).sub(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(tmpV);
      camera.updateMatrixWorld();

      // derived state
      state.camDist = cam.radius;
      state.altitude = Math.max(cam.radius - cam.focus.radius, 1e-9);
      // altitude, not center-distance: hovering 5 km over Everest should read
      // "≈ 5 km", not "≈ Earth's radius" (identical at large scales anyway)
      state.viewWidthUnits = 2 * state.altitude * Math.tan(FOV * Math.PI / 360);
      state.viewKm = displayKm(state.viewWidthUnits);
      state.camOriginDist = camPos.length();
      if (!flight) { state.focusName = cam.focus.name; state.focusLabel = cam.focus.label; }

      // sun light follows the sun
      sunLight.position.copy(eph.sun);

      // modules
      for (var i = 0; i < updaters.length; i++) {
        try { updaters[i](dt, state); }
        catch (err) { COSMOS.lastUpdateError = String(err && err.stack || err); }
      }

      // HUD at ~10 Hz
      hudAccum += dt;
      if (hudAccum > 0.1) {
        hudAccum = 0;
        nameN.textContent = state.focusLabel;
        nameD.textContent = 'altitude ' + fmtKm(displayKm(state.altitude));
        nameW.textContent = cam.focus.warn || '';
        scaleW.textContent = fmtKm(state.viewKm);
        scaleRef.textContent = state.realm === 'observable'
          ? refLine(state.viewKm)
          : (realms[state.realm] ? realms[state.realm].def.tagline : '');

        // caption bands with a settle delay (Observable Universe narration only)
        var bi = -1;
        if (state.realm === 'observable') {
          for (var b = 0; b < BANDS.length; b++) {
            if (state.viewKm >= BANDS[b][0] &&
                (!BANDS[b][2] || BANDS[b][2] === state.focusName)) bi = b;
          }
        }
        if (bi >= 0 && bi !== bandIdx) {
          if (state.t < suppressBandUntil) bandIdx = bi;   // absorb silently after arrivals
          else if (bi !== bandPendIdx) { bandPendIdx = bi; bandPendAt = state.t; }
          else if (state.t - bandPendAt > 0.9) { bandIdx = bi; showToast(BANDS[bi][1], 8000); }
        }
        if (toastTimer && state.t > toastTimer) { hudCaption.classList.remove('show'); toastTimer = 0; }
        if (infoOpen && (state.focusName !== 'earth' || state.altitude > 0.5)) hideInfo();

        // destinations bar: in fictional universes always; at home once inside
        if (navEl) {
          navEl.classList.toggle('show',
            state.realm !== 'observable' || state.viewWidthUnits < 8e5);
          for (var nk in navBtns) navBtns[nk].classList.toggle('cur', nk === state.focusName);
        }
      }

      renderer.render(scene, camera);
    }

    // ---- go -------------------------------------------------------------------------
    loadTextures().then(function () {
      // ~7 MB of base64 source strings are decoded into GPU textures now —
      // release the JS-heap copies (matters on memory-tight phones)
      window.COSMOS_ASSETS = null;
      window.COSMOS_ASSETS2 = null;
      for (var i = 0; i < registry.length; i++) {
        try { registry[i].build(ctx); }
        catch (err) {
          window.onerror('module "' + registry[i].name + '" failed: ' + err.message, 'engine.js', 0);
        }
      }

      // ---- multiverse assembly ------------------------------------------------
      // Fold everything built so far into realm 0: the Observable Universe.
      var obsGroup = new THREE.Group();
      obsGroup.name = 'realm-observable';
      var kids = world.children.slice();
      for (var w = 0; w < kids.length; w++) obsGroup.add(kids[w]);
      world.add(obsGroup);
      realms.observable = { group: obsGroup, def: {
        id: 'observable', name: 'Observable Universe',
        tagline: 'everything that is real', accent: '#c8d4ec'
      } };

      // Build every registered universe in its own isolated, hidden realm.
      // Nothing leaks between realms: separate groups, focusables, lights.
      COSMOS._universeDefs.forEach(function (def) {
        var g = new THREE.Group();
        g.name = 'realm-' + def.id;
        g.visible = false;
        world.add(g);
        realmNavLists[def.id] = [];
        try {
          def.build(ctx, g, function (f) {
            f.realm = def.id;
            addFocus(f);
            realmNavLists[def.id].push(f.name);
            if (f.home) realmHome[def.id] = f.name;
          });
        } catch (err) {
          window.onerror('universe "' + def.id + '" failed: ' + err.message, 'engine.js', 0);
        }
        realms[def.id] = { group: g, def: def };
        if (def.facts) {
          Object.keys(def.facts).forEach(function (k) { FOCUS_FACTS[k] = def.facts[k]; });
        }
      });
      buildAtlas();
      rebuildNav('observable');   // include destinations modules added at build

      el('loading').classList.add('gone');
      clock.start();
      frame();
    });
  };
})();
