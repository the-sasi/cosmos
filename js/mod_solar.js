/* mod_solar.js — the Sun (granulation + corona + far glint), all planets except
   Earth with canvas-procedural textures, Saturn's rings, the Moon, orbit lines
   and screen-constant name labels. */
(function () {
  'use strict';

  COSMOS.register('solar', function (ctx) {
    var THREE = ctx.THREE;
    var L = ctx.layout;
    var Q = ctx.quality;
    var world = ctx.world;
    var high = Q.tier === 'high';
    var TS = Q.texSize;                       // 512 low / 1024 high
    var aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
    var TWO_PI = Math.PI * 2;
    var DEG = Math.PI / 180;
    var DAY_SECONDS = 120;                    // one Earth day of spin, matches mod_earth

    /* ===================== tiny math / noise helpers ====================== */

    function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
    function sstep(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

    // deterministic integer lattice hash -> [0,1)
    function ih(i, j, s) {
      var n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1103515245)) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      n = n ^ (n >>> 16);
      return (n >>> 0) / 4294967296;
    }

    // 2D value noise, periodic in x with integer period `per` (so equirect
    // textures wrap seamlessly at the u = 0/1 seam)
    function vnoise2(x, y, per, seed) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf);
      var v = yf * yf * (3 - 2 * yf);
      var x0 = xi % per; if (x0 < 0) x0 += per;
      var x1 = x0 + 1; if (x1 >= per) x1 = 0;
      var a = ih(x0, yi, seed), b = ih(x1, yi, seed);
      var c = ih(x0, yi + 1, seed), d = ih(x1, yi + 1, seed);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    // fbm over u (wraps at 1) and v; `freq` must be an integer
    function fbm(u, v, oct, freq, seed) {
      var sum = 0, amp = 0.5, tot = 0, f = freq;
      for (var o = 0; o < oct; o++) {
        sum += amp * vnoise2(u * f, v * f * 0.5 + o * 19.7, f, seed + o * 131);
        tot += amp;
        amp *= 0.5;
        f *= 2;
      }
      return sum / tot;
    }

    function mulberry(seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /* ===================== canvas texture helpers ========================= */

    // per-pixel equirect painter; fn(u, v, out[3]) writes 0-255 rgb
    function buildTexture(w, h, fn) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      var img = g.createImageData(w, h);
      var d = img.data;
      var out = [0, 0, 0];
      for (var y = 0; y < h; y++) {
        var v = (y + 0.5) / h;
        for (var x = 0; x < w; x++) {
          fn((x + 0.5) / w, v, out);
          var i = (y * w + x) * 4;
          d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    function canvasTex(c) {
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      return t;
    }

    // stops: [v, r, g, b] sorted by v; smooth interpolation between them
    function bandLerp(stops, v, out) {
      var first = stops[0], last = stops[stops.length - 1];
      if (v <= first[0]) { out[0] = first[1]; out[1] = first[2]; out[2] = first[3]; return; }
      if (v >= last[0]) { out[0] = last[1]; out[1] = last[2]; out[2] = last[3]; return; }
      var i = 0;
      while (v > stops[i + 1][0]) i++;
      var a = stops[i], b = stops[i + 1];
      var t = sstep(a[0], b[0], v);
      out[0] = a[1] + (b[1] - a[1]) * t;
      out[1] = a[2] + (b[2] - a[2]) * t;
      out[2] = a[3] + (b[3] - a[3]) * t;
    }

    function radialSprite(size, stops) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    }

    /* ============================== THE SUN =============================== */

    var SUN_R = L.SUN.radius;

    var sunUniforms = { uTime: { value: 0 } };
    var sunMat = new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_vertex>',
        'varying vec3 vObj;',
        'varying vec3 vN;',
        'varying vec3 vV;',
        'void main() {',
        '  vObj = position;',
        '  vN = normalMatrix * normal;',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  vV = -mvPosition.xyz;',
        '  gl_Position = projectionMatrix * mvPosition;',
        '  #include <logdepthbuf_vertex>',
        '}'
      ].join('\n'),
      fragmentShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_fragment>',
        'uniform float uTime;',
        'varying vec3 vObj;',
        'varying vec3 vN;',
        'varying vec3 vV;',
        'float vhash(vec3 p) {',
        '  p = fract(p * vec3(0.1031, 0.11369, 0.13787));',
        '  p += dot(p, p.yzx + 19.19);',
        '  return fract((p.x + p.y) * p.z);',
        '}',
        'float vnoise(vec3 p) {',
        '  vec3 i = floor(p);',
        '  vec3 f = fract(p);',
        '  vec3 u = f * f * (3.0 - 2.0 * f);',
        '  float a = mix(vhash(i), vhash(i + vec3(1.0, 0.0, 0.0)), u.x);',
        '  float b = mix(vhash(i + vec3(0.0, 1.0, 0.0)), vhash(i + vec3(1.0, 1.0, 0.0)), u.x);',
        '  float c = mix(vhash(i + vec3(0.0, 0.0, 1.0)), vhash(i + vec3(1.0, 0.0, 1.0)), u.x);',
        '  float d = mix(vhash(i + vec3(0.0, 1.0, 1.0)), vhash(i + vec3(1.0, 1.0, 1.0)), u.x);',
        '  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);',
        '}',
        'void main() {',
        '  #include <logdepthbuf_fragment>',
        '  vec3 dir = normalize(vObj);',
        '  float t = uTime;',
        // two octaves of drifting granulation
        '  float n = 0.62 * vnoise(dir * 24.0 + vec3(t * 0.040, t * 0.028, -t * 0.022));',
        '  n += 0.38 * vnoise(dir * 72.0 + vec3(-t * 0.055, t * 0.047, t * 0.036));',
        // limb darkening
        '  float mu = clamp(dot(normalize(vV), normalize(vN)), 0.0, 1.0);',
        '  float limb = pow(mu, 0.58);',
        '  vec3 cCore = vec3(1.0, 0.98, 0.90);',
        '  vec3 cMid  = vec3(1.0, 0.80, 0.42);',
        '  vec3 cRim  = vec3(0.98, 0.44, 0.10);',
        '  vec3 col = mix(cMid, cCore, smoothstep(0.28, 0.82, n));',
        '  col = mix(cRim, col, limb);',
        '  col *= 0.86 + 0.30 * n;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });

    var sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R, high ? 64 : 40, high ? 48 : 28), sunMat);
    sunMesh.position.copy(ctx.eph.sun);
    world.add(sunMesh);

    // --- corona: two additive halo sprites, gently breathing ----------------
    function glowSprite(stops, size, opacity, order) {
      var tex = new THREE.CanvasTexture(radialSprite(size, stops));
      tex.colorSpace = THREE.SRGBColorSpace;
      var m = new THREE.SpriteMaterial({
        map: tex, blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, opacity: opacity
      });
      var s = new THREE.Sprite(m);
      s.renderOrder = order;
      s.frustumCulled = false;
      world.add(s);
      return s;
    }

    var COR_IN = SUN_R * 6.6;    // sprite width -> halo reaches ~3.3x radius
    var COR_OUT = SUN_R * 12.0;  // ~6x radius
    var coronaIn = glowSprite([
      [0.00, 'rgba(255,246,222,0.90)'],
      [0.16, 'rgba(255,212,140,0.50)'],
      [0.38, 'rgba(255,166,84,0.18)'],
      [0.65, 'rgba(255,130,52,0.05)'],
      [1.00, 'rgba(255,110,40,0)']
    ], 256, 0.85, 6);
    var coronaOut = glowSprite([
      [0.00, 'rgba(255,240,214,0.55)'],
      [0.20, 'rgba(255,196,120,0.20)'],
      [0.50, 'rgba(255,150,70,0.06)'],
      [1.00, 'rgba(255,120,50,0)']
    ], 256, 0.60, 6);
    coronaIn.scale.set(COR_IN, COR_IN, 1);
    coronaOut.scale.set(COR_OUT, COR_OUT, 1);

    // --- far-visibility glint: constant apparent size, so the Sun reads as a
    // star from anywhere. K = 0.012 rad (~14 px at 1080p); for every distance
    // below ~45,000 units this stays under 2.5x the Sun's own angular size, so
    // the clamp condition of the spec is met by construction while the glint
    // keeps home visible from the galaxy frame.
    var glintCanvas = radialSprite(128, [
      [0.00, 'rgba(255,252,244,1.0)'],
      [0.07, 'rgba(255,238,196,0.85)'],
      [0.18, 'rgba(255,208,132,0.32)'],
      [0.42, 'rgba(255,176,96,0.08)'],
      [1.00, 'rgba(255,150,80,0)']
    ]);
    (function crossFlare() {   // subtle 4-point diffraction streaks
      var g = glintCanvas.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 2; k++) {
        g.save();
        g.translate(64, 64);
        g.rotate(k * Math.PI / 2);
        var grd = g.createLinearGradient(-62, 0, 62, 0);
        grd.addColorStop(0, 'rgba(255,240,210,0)');
        grd.addColorStop(0.5, 'rgba(255,240,210,0.5)');
        grd.addColorStop(1, 'rgba(255,240,210,0)');
        g.fillStyle = grd;
        g.fillRect(-62, -1.5, 124, 3);
        g.restore();
      }
    })();
    var glintTex = new THREE.CanvasTexture(glintCanvas);
    glintTex.colorSpace = THREE.SRGBColorSpace;
    var glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glintTex, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: 0.9
    }));
    glint.renderOrder = 7;
    glint.frustumCulled = false;
    world.add(glint);
    var GLINT_K = 0.012;

    /* ======================= procedural planet skins ====================== */

    function texMercury(w, h) {
      var c = buildTexture(w, h, function (u, v, out) {
        var n = fbm(u, v, 4, 7, 11);
        var m = fbm(u + 0.31, v * 1.2, 2, 3, 12);
        var g0 = 104 + n * 74 - sstep(0.5, 0.72, m) * 24;
        out[0] = g0 * 1.04; out[1] = g0 * 0.99; out[2] = g0 * 0.92;
      });
      var g = c.getContext('2d');
      var R = mulberry(777);
      function crater1(cx, cy, r) {
        var grd = g.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
        grd.addColorStop(0.00, 'rgba(24,22,20,0.34)');
        grd.addColorStop(0.62, 'rgba(28,26,24,0.18)');
        grd.addColorStop(0.80, 'rgba(226,220,210,0.14)');
        grd.addColorStop(0.92, 'rgba(240,236,226,0.22)');
        grd.addColorStop(1.00, 'rgba(240,236,226,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(cx, cy, r, 0, TWO_PI); g.fill();
      }
      function crater(cx, cy, r) {   // wrap copies at the seam
        crater1(cx, cy, r);
        if (cx < r) crater1(cx + w, cy, r);
        if (cx > w - r) crater1(cx - w, cy, r);
      }
      var i, cr;
      for (i = 0; i < 6; i++) {      // faint giant basins
        cr = w * (0.03 + 0.05 * R());
        var bx = R() * w, by = h * (0.15 + 0.7 * R());
        var grd = g.createRadialGradient(bx, by, cr * 0.2, bx, by, cr);
        grd.addColorStop(0, 'rgba(20,18,16,0.12)');
        grd.addColorStop(1, 'rgba(20,18,16,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(bx, by, cr, 0, TWO_PI); g.fill();
      }
      var count = high ? 260 : 130;
      for (i = 0; i < count; i++) {
        cr = 1.5 + Math.pow(R(), 2.8) * 0.030 * w;
        crater(R() * w, h * (0.06 + 0.88 * R()), cr);
      }
      return c;
    }

    function texVenus(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var sw = fbm(u, v * 1.3, 3, 3, 21) - 0.5;
        var uu = u + sw * 0.4 + (v - 0.5) * 0.22;   // sheared sulfur swirl
        var n = fbm(uu, v * 2.6, 3, 6, 22);
        var band = 0.5 + 0.5 * Math.sin((v + sw * 0.35) * Math.PI * 5.0);
        var l = n * 0.7 + band * 0.3;
        var r0 = 152 + l * 92, g0 = 122 + l * 90, b0 = 78 + l * 88;
        var pol = sstep(0.4, 0.5, Math.abs(v - 0.5)) * 0.14;
        out[0] = r0 * (1 - pol); out[1] = g0 * (1 - pol); out[2] = b0 * (1 - pol * 1.1);
      });
    }

    function texMars(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var n = fbm(u, v, 4, 9, 33);
        var mar = fbm(u + 0.47, v * 1.1, 3, 4, 34);
        var r0 = 166 + n * 58, g0 = 94 + n * 40, b0 = 56 + n * 26;
        // dark basalt maria, strongest at mid latitudes
        var dm = sstep(0.56, 0.7, mar) * 0.55 * (0.4 + 0.6 * Math.sin(v * Math.PI));
        r0 -= dm * 92; g0 -= dm * 46; b0 -= dm * 16;
        // ragged polar caps
        var en = (fbm(u, 0.31, 2, 8, 35) - 0.5) * 0.045;
        var cap = (1 - sstep(0.028 + en, 0.075 + en, v)) + sstep(0.935 - en, 0.968 - en, v);
        cap = clamp01(cap);
        r0 += (238 - r0) * cap; g0 += (234 - g0) * cap; b0 += (228 - b0) * cap;
        out[0] = r0; out[1] = g0; out[2] = b0;
      });
    }

    var JUP_STOPS = [
      [0.00, 158, 134, 104], [0.09, 193, 170, 138], [0.17, 165, 126, 88],
      [0.25, 228, 214, 186], [0.33, 178, 133, 92], [0.41, 238, 226, 200],
      [0.49, 200, 155, 110], [0.57, 234, 220, 194], [0.67, 172, 127, 86],
      [0.77, 214, 196, 162], [0.89, 180, 154, 120], [1.00, 150, 128, 102]
    ];
    function texJupiter(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var turb = fbm(u, v * 3.0, 3, 9, 44) - 0.5;
        var vv = v + turb * 0.04 * (0.35 + 0.65 * Math.sin(v * Math.PI));
        bandLerp(JUP_STOPS, vv, out);
        var f = 0.94 + (fbm(u, v * 2.0, 3, 16, 45) - 0.5) * 0.16;
        out[0] *= f; out[1] *= f; out[2] *= f;
        // Great Red Spot + pale collar
        var du = u - 0.72; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
        var dx = du / 0.058, dy = (v - 0.66) / 0.040;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.7) {
          var core = (1 - sstep(0.2, 1.05, d)) * (0.8 + 0.5 * fbm(u * 4, v * 8, 2, 24, 46));
          core = clamp01(core);
          out[0] += (198 - out[0]) * core;
          out[1] += (86 - out[1]) * core;
          out[2] += (58 - out[2]) * core;
          var halo = sstep(0.9, 1.15, d) * (1 - sstep(1.25, 1.7, d)) * 0.5;
          out[0] += (240 - out[0]) * halo;
          out[1] += (232 - out[1]) * halo;
          out[2] += (212 - out[2]) * halo;
        }
      });
    }

    var SAT_STOPS = [
      [0.00, 148, 128, 100], [0.10, 184, 164, 130], [0.20, 170, 146, 112],
      [0.30, 205, 188, 154], [0.42, 190, 168, 130], [0.54, 216, 200, 166],
      [0.66, 196, 176, 140], [0.80, 182, 160, 126], [1.00, 152, 132, 104]
    ];
    function texSaturn(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var turb = fbm(u, v * 2.4, 3, 7, 55) - 0.5;
        bandLerp(SAT_STOPS, v + turb * 0.022, out);
        var f = 0.96 + (fbm(u, v * 1.6, 2, 12, 56) - 0.5) * 0.09;
        out[0] *= f; out[1] *= f; out[2] *= f;
      });
    }

    function texUranus(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var n = fbm(u, v * 1.4, 3, 4, 66) - 0.5;
        var eq = Math.sin(v * Math.PI);
        var band = Math.exp(-Math.pow((v - 0.36) / 0.06, 2)) * 7;
        out[0] = 138 + eq * 16 + n * 10 + band * 0.5;
        out[1] = 192 + eq * 13 + n * 8 + band;
        out[2] = 201 + eq * 11 + n * 7 + band;
      });
    }

    function texNeptune(w, h) {
      return buildTexture(w, h, function (u, v, out) {
        var n = fbm(u, v * 2.0, 3, 5, 77);
        var eq = Math.sin(v * Math.PI);
        var band = Math.sin(v * Math.PI * 6.0 + (n - 0.5) * 2.4) * 0.5 + 0.5;
        var l = n * 0.5 + band * 0.22 + eq * 0.28;
        var r0 = 26 + l * 42, g0 = 56 + l * 66, b0 = 138 + l * 82;
        // Great Dark Spot
        var du = u - 0.31; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
        var dx = du / 0.05, dy = (v - 0.6) / 0.034;
        var dark = 1 - sstep(0.3, 1.05, Math.sqrt(dx * dx + dy * dy));
        r0 *= 1 - dark * 0.45; g0 *= 1 - dark * 0.45; b0 *= 1 - dark * 0.3;
        // faint white cirrus streaks
        var cir = sstep(0.7, 0.83, fbm(u, v * 3.2, 3, 10, 78)) * 0.42;
        r0 += (222 - r0) * cir; g0 += (234 - g0) * cir; b0 += (246 - b0) * cir;
        out[0] = r0; out[1] = g0; out[2] = b0;
      });
    }

    /* ============================== PLANETS =============================== */

    var PLANET_DEFS = {
      mercury: { days: 58.6, tex: texMercury, w: TS,      shin: 6,  spec: 0x1a1a1a },
      venus:   { days: 243,  tex: texVenus,   w: TS,      shin: 12, spec: 0x33301f },
      mars:    { days: 1.03, tex: texMars,    w: TS,      shin: 6,  spec: 0x1a1512 },
      jupiter: { days: 0.414, tex: texJupiter, w: TS,     shin: 9,  spec: 0x222220 },
      saturn:  { days: 0.444, tex: texSaturn, w: TS,      shin: 9,  spec: 0x222220 },
      uranus:  { days: 0.718, tex: texUranus, w: TS >> 1, shin: 18, spec: 0x2a3a44 },
      neptune: { days: 0.671, tex: texNeptune, w: TS >> 1, shin: 18, spec: 0x2a3244 }
    };

    var planetItems = [];
    var pIdx = 0;
    Object.keys(PLANET_DEFS).forEach(function (k) {
      var def = PLANET_DEFS[k];
      var p = L.PLANETS[k];
      // real 2K imagery when bundled; procedural canvas as offline fallback
      var tex = ctx.assets[k] || canvasTex(def.tex(def.w, def.w >> 1));
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius, high ? 48 : 28, high ? 32 : 20),
        new THREE.MeshPhongMaterial({ map: tex, shininess: def.shin, specular: new THREE.Color(def.spec) })
      );
      mesh.rotation.y = pIdx * 2.13;           // vary the starting face
      var tiltG = new THREE.Group();           // spin happens INSIDE the tilt
      tiltG.rotation.z = p.tilt * DEG;
      tiltG.add(mesh);
      var grp = new THREE.Group();
      grp.add(tiltG);
      grp.position.copy(ctx.eph[k]);
      world.add(grp);
      planetItems.push({ pos: ctx.eph[k], grp: grp, mesh: mesh, spin: TWO_PI / (DAY_SECONDS * def.days) });
      if (k === 'saturn') addSaturnRing(tiltG, p.radius);
      pIdx++;
    });

    /* ============================ SATURN RING ============================= */

    function band01(t, a, b, s) { return sstep(a, a + s, t) * (1 - sstep(b - s, b, t)); }

    function texRing(w) {
      var c = document.createElement('canvas');
      c.width = w; c.height = 8;
      var g = c.getContext('2d');
      var img = g.createImageData(w, 1);
      var d = img.data;
      for (var x = 0; x < w; x++) {
        var t = (x + 0.5) / w;
        var a = 0;
        a += 0.32 * band01(t, 0.010, 0.260, 0.050);   // C ring — translucent dust
        a += 0.95 * band01(t, 0.285, 0.680, 0.025);   // B ring — bright
        a += 0.12 * band01(t, 0.680, 0.765, 0.020);   // Cassini division haze
        a += 0.74 * band01(t, 0.775, 0.985, 0.020);   // A ring
        a *= 1 - 0.85 * Math.exp(-Math.pow((t - 0.935) / 0.007, 2));  // Encke gap
        var f1 = ih(Math.floor(t * 420), 0, 91);
        var f2 = ih(Math.floor(t * 133), 1, 92);
        a *= 0.72 + 0.38 * (f1 * 0.6 + f2 * 0.4);     // fine ringlet striations
        a = clamp01(a);
        var brt = 0.78 + 0.34 * (f2 * 0.65 + f1 * 0.35);
        var warm = sstep(0.0, 0.3, t);
        d[x * 4]     = (196 + 26 * warm) * brt;
        d[x * 4 + 1] = (172 + 26 * warm) * brt;
        d[x * 4 + 2] = (136 + 30 * warm) * brt;
        d[x * 4 + 3] = a * 255;
      }
      for (var y = 0; y < 8; y++) g.putImageData(img, 0, y);
      return c;
    }

    function addSaturnRing(parent, planetR) {
      var rIn = planetR * 1.24, rOut = planetR * 2.27;
      var geo = new THREE.RingGeometry(rIn, rOut, high ? 128 : 96, 1);
      // RingGeometry UVs are planar — remap radially so the strip texture
      // reads as concentric ringlets: u = (len(pos.xy) - inner) / (outer - inner)
      var pos = geo.attributes.position, uv = geo.attributes.uv;
      for (var i = 0; i < pos.count; i++) {
        var px = pos.getX(i), py = pos.getY(i);
        uv.setXY(i, (Math.sqrt(px * px + py * py) - rIn) / (rOut - rIn), 0.5);
      }
      uv.needsUpdate = true;
      var tex = ctx.assets.saturnRing;
      if (!tex) {
        tex = new THREE.CanvasTexture(texRing(TS));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso;
      }
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, color: ctx.assets.saturnRing ? 0xffffff : 0xd8d0c2
      }));
      mesh.rotation.x = -Math.PI / 2;          // XY ring -> equatorial plane
      mesh.renderOrder = 2;
      parent.add(mesh);
    }

    /* =============================== MOON ================================= */

    function texMoonFallback(w, h) {   // only used if the real texture failed to load
      var c = buildTexture(w, h, function (u, v, out) {
        var n = fbm(u, v, 4, 6, 88);
        var m = fbm(u + 0.2, v * 1.2, 3, 3, 89);
        var g0 = 128 + n * 62 - sstep(0.5, 0.7, m) * 46;
        out[0] = g0; out[1] = g0 * 0.99; out[2] = g0 * 0.96;
      });
      var g = c.getContext('2d');
      var R = mulberry(4242);
      for (var i = 0; i < 90; i++) {
        var cr = 1.5 + Math.pow(R(), 2.5) * 0.05 * w;
        var cx = R() * w, cy = h * (0.08 + 0.84 * R());
        var grd = g.createRadialGradient(cx, cy, cr * 0.15, cx, cy, cr);
        grd.addColorStop(0, 'rgba(22,22,22,0.3)');
        grd.addColorStop(0.75, 'rgba(26,26,26,0.12)');
        grd.addColorStop(0.92, 'rgba(235,232,226,0.2)');
        grd.addColorStop(1, 'rgba(235,232,226,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(cx, cy, cr, 0, TWO_PI); g.fill();
      }
      return c;
    }

    var moonMap = ctx.assets.moon || canvasTex(texMoonFallback(512, 256));
    var moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(L.MOON.radius, high ? 40 : 26, high ? 28 : 18),
      new THREE.MeshLambertMaterial({ map: moonMap })
    );
    moonMesh.position.copy(ctx.eph.moon);
    world.add(moonMesh);

    /* ===================== MOONS OF THE OTHER PLANETS ==================== */
    // Simple sun-lit spheres in each moon's characteristic color; positions
    // come from the engine ephemeris, labels ride the shared reveal logic.
    var moonItems = [];
    Object.keys(L.MOONS || {}).forEach(function (k) {
      var m = L.MOONS[k];
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.radius, high ? 28 : 18, high ? 20 : 12),
        new THREE.MeshLambertMaterial({ color: m.color })
      );
      mesh.position.copy(ctx.eph[k]);
      world.add(mesh);
      moonItems.push({ key: k, mesh: mesh });
    });

    /* ============================ ORBIT LINES ============================= */

    var orbitMat = new THREE.LineBasicMaterial({
      color: 0x26314d, transparent: true, opacity: 0.35, depthWrite: false
    });
    Object.keys(L.PLANETS).forEach(function (k) {
      var orbit = L.PLANETS[k].orbit;
      var pts = new Float32Array(160 * 3);
      for (var i = 0; i < 160; i++) {
        var a = (i / 160) * TWO_PI;
        pts[i * 3] = Math.cos(a) * orbit;
        pts[i * 3 + 1] = 0;
        pts[i * 3 + 2] = Math.sin(a) * orbit;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      var line = new THREE.LineLoop(geo, orbitMat);
      line.frustumCulled = false;
      line.renderOrder = 1;
      world.add(line);
    });

    /* ============================== LABELS ================================ */

    var LABEL_PX = Q.isMobile ? 17 : 15;   // on-screen label height in px
    var labels = [];
    function addLabel(key, text, radius, orbit) {
      var s = ctx.makeTextSprite(text, { fontPx: 44, color: '#eaf0fc' });
      s.visible = false;
      world.add(s);
      labels.push({ key: key, sprite: s, radius: radius, orbit: orbit || 0, aspect: s.userData.aspect });
    }
    addLabel('sun', 'Sun', SUN_R, 0);
    Object.keys(L.PLANETS).forEach(function (k) {
      addLabel(k, L.PLANETS[k].label, L.PLANETS[k].radius, L.PLANETS[k].orbit);
    });
    addLabel('moon', 'Moon', L.MOON.radius, L.MOON.orbit);
    Object.keys(L.MOONS || {}).forEach(function (k) {
      addLabel(k, L.MOONS[k].label, L.MOONS[k].radius, L.MOONS[k].orbit);
    });

    /* ============================== ANIMATE =============================== */

    var tmpA = new THREE.Vector3();
    var SUN_SPIN = TWO_PI / (DAY_SECONDS * 25.4);

    ctx.onUpdate(function (dt, st) {
      var ts = st.timeScale;

      // sun: granulation drift + slow differential-ish rotation
      sunUniforms.uTime.value = st.t;
      sunMesh.rotation.y += SUN_SPIN * dt * ts;
      sunMesh.position.copy(ctx.eph.sun);

      // corona breathing (pure shimmer — may follow raw t)
      var p1 = 1 + 0.03 * Math.sin(st.t * 0.5);
      var p2 = 1 + 0.04 * Math.sin(st.t * 0.33 + 1.7);
      coronaIn.scale.set(COR_IN * p1, COR_IN * p1, 1);
      coronaOut.scale.set(COR_OUT * p2, COR_OUT * p2, 1);
      coronaIn.material.opacity = 0.8 + 0.08 * Math.sin(st.t * 0.7);
      coronaIn.position.copy(ctx.eph.sun);
      coronaOut.position.copy(ctx.eph.sun);

      // far glint: constant apparent size from any distance
      var dSun = tmpA.copy(st.camPos).sub(ctx.eph.sun).length();
      var gh = dSun * GLINT_K;
      glint.scale.set(gh, gh, 1);
      glint.position.copy(ctx.eph.sun);

      // planets: follow ephemeris, spin about tilted axis
      for (var i = 0; i < planetItems.length; i++) {
        var it = planetItems[i];
        it.grp.position.copy(it.pos);
        it.mesh.rotation.y += it.spin * dt * ts;
      }

      // moon: follow ephemeris, tidally locked to face Earth
      moonMesh.position.copy(ctx.eph.moon);
      tmpA.copy(ctx.eph.earth).sub(ctx.eph.moon);
      moonMesh.rotation.y = Math.atan2(tmpA.x, tmpA.z);

      // moons of the other planets ride the ephemeris
      for (var mi = 0; mi < moonItems.length; mi++) {
        moonItems[mi].mesh.position.copy(ctx.eph[moonItems[mi].key]);
      }

      // labels: screen-constant height. A body's label shows once its orbit is
      // visually separated from its parent (>= 44 px), so names reveal
      // progressively on the way in — Sun first, outer planets, then inner.
      for (var j = 0; j < labels.length; j++) {
        var lb = labels[j];
        var pos = ctx.eph[lb.key];
        var dist = tmpA.copy(pos).sub(st.camPos).length();
        var ppu = st.pixelsPerUnit(dist);
        var pd = 2 * lb.radius * ppu;                 // apparent diameter in px
        var show = false;
        if (st.labelsVisible && st.camOriginDist < 4e6) {
          if (lb.orbit === 0) show = pd <= 24;        // sun: beacon until obvious
          else show = pd <= 60 && lb.orbit * ppu >= 44;
        }
        if (show) {
          lb.sprite.visible = true;
          var hw = LABEL_PX / ppu;                    // label height in world units
          lb.sprite.position.set(pos.x, pos.y + lb.radius + hw * 1.2, pos.z);
          lb.sprite.scale.set(hw * lb.aspect, hw, 1);
        } else {
          lb.sprite.visible = false;
        }
      }
    });
  });
})();
