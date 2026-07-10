/* mod_universe.js — starfield shell, Milky Way band with nebulae, cosmic-web deep sky */
(function () {
  'use strict';

  COSMOS.register('universe', function (ctx) {
    var THREE = ctx.THREE;
    var L = ctx.layout;
    var Q = ctx.quality;
    var rand = Math.random;

    // approximate gaussian (sum of uniforms), build-time only
    function g3() { return (rand() + rand() + rand() - 1.5) * 1.4; }

    // Milky Way band orientation — one tilt shared by the disc group and the
    // band-biased portion of the starfield so everything lines up in the sky.
    var tiltEuler = new THREE.Euler(
      THREE.MathUtils.degToRad(62), 0.52, THREE.MathUtils.degToRad(-11), 'XYZ');
    var tiltQ = new THREE.Quaternion().setFromEuler(tiltEuler);

    // ------------------------------------------------------------------
    // Shared soft-point shader (log-depth aware, screen-size clamped)
    // ------------------------------------------------------------------
    var PTS_VERT = [
      'attribute float aSize;',
      'attribute vec3 aColor;',
      'attribute float aPhase;',
      'uniform float uTime;',
      'uniform float uPxScale;',
      'uniform float uMinPx;',
      'uniform float uMaxPx;',
      'uniform float uTwAmp;',
      'varying vec3 vColor;',
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'void main() {',
      '  float tw = 1.0 + uTwAmp * sin(uTime * (0.5 + fract(aPhase * 0.633) * 2.2) + aPhase * 7.0);',
      '  vColor = aColor * tw;',
      '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
      '  float px = aSize * uPxScale / max(-mvPosition.z, 1e-3);',
      '  gl_PointSize = clamp(px, uMinPx, uMaxPx);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  #include <logdepthbuf_vertex>',
      '}'
    ].join('\n');

    var PTS_FRAG = [
      'varying vec3 vColor;',
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  vec2 pc = gl_PointCoord * 2.0 - 1.0;',
      '  float d2 = dot(pc, pc);',
      '  if (d2 > 1.0) discard;',
      '  float a = 1.0 - d2;',
      '  a *= a;',
      '  gl_FragColor = vec4(vColor, a);',
      '}'
    ].join('\n');

    function makePointsMaterial(minPx, maxPx, twAmp) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPxScale: { value: 1000 },
          uMinPx: { value: minPx },
          uMaxPx: { value: maxPx },
          uTwAmp: { value: twAmp }
        },
        vertexShader: PTS_VERT,
        fragmentShader: PTS_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
    }

    // ==================================================================
    // 1. STARFIELD SHELL — temperature-tinted, subtle twinkle
    // ==================================================================
    var STAR_N = Math.floor(25000 * Q.particleScale);
    var sPos = new Float32Array(STAR_N * 3);
    var sCol = new Float32Array(STAR_N * 3);
    var sSiz = new Float32Array(STAR_N);
    var sPhs = new Float32Array(STAR_N);

    var r3a = Math.pow(L.STARFIELD.rMin, 3);
    var r3b = Math.pow(L.STARFIELD.rMax, 3);
    var tmpV = new THREE.Vector3();
    var i, j;

    for (i = 0; i < STAR_N; i++) {
      var band = rand() < 0.36;
      tmpV.set(g3(), band ? g3() * 0.16 : g3(), g3());
      if (tmpV.lengthSq() < 1e-8) tmpV.set(1, 0.2, 0.3);
      tmpV.normalize();
      if (band) tmpV.applyQuaternion(tiltQ);
      tmpV.multiplyScalar(Math.cbrt(r3a + (r3b - r3a) * rand()));
      sPos[i * 3] = tmpV.x; sPos[i * 3 + 1] = tmpV.y; sPos[i * 3 + 2] = tmpV.z;

      // stellar temperature tint: a few hot blue, many white/yellow, some red
      var tr = rand(), cr, cg, cb;
      if (tr < 0.13)      { cr = 0.62; cg = 0.74; cb = 1.00; }
      else if (tr < 0.38) { cr = 0.85; cg = 0.90; cb = 1.00; }
      else if (tr < 0.64) { cr = 1.00; cg = 0.98; cb = 0.92; }
      else if (tr < 0.83) { cr = 1.00; cg = 0.88; cb = 0.70; }
      else if (tr < 0.94) { cr = 1.00; cg = 0.74; cb = 0.52; }
      else                { cr = 1.00; cg = 0.58; cb = 0.44; }
      var bright = 0.45 + 0.55 * Math.pow(rand(), 1.6);
      sCol[i * 3] = cr * bright;
      sCol[i * 3 + 1] = cg * bright;
      sCol[i * 3 + 2] = cb * bright;

      var sz = 380 + 2000 * Math.pow(rand(), 3.2);
      if (rand() < 0.02) sz *= 2.0;                 // a handful of standouts
      sSiz[i] = sz;
      sPhs[i] = rand() * 6.2832;
    }

    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSiz, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhs, 1));

    var starMat = makePointsMaterial(1.0, 6.0, 0.16);
    var stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -4;
    ctx.world.add(stars);

    // ==================================================================
    // 2. MILKY WAY — particle disc + soft nebula sprites, tilted band
    // ==================================================================
    var tiltGroup = new THREE.Group();
    tiltGroup.quaternion.copy(tiltQ);
    var spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);
    ctx.world.add(tiltGroup);

    var R = L.GALAXY.radius;
    var TH = L.GALAXY.thickness;
    var DISC_N = Math.floor(16000 * Q.particleScale);
    var dPos = new Float32Array(DISC_N * 3);
    var dCol = new Float32Array(DISC_N * 3);
    var dSiz = new Float32Array(DISC_N);
    var dPhs = new Float32Array(DISC_N);

    function discRamp(t, out) {          // warm core -> pale mid -> cool rim
      var a, b, k;
      if (t < 0.45) { k = t / 0.45; a = [1.00, 0.86, 0.64]; b = [0.93, 0.92, 0.96]; }
      else { k = (t - 0.45) / 0.55; a = [0.93, 0.92, 0.96]; b = [0.60, 0.72, 1.00]; }
      out[0] = a[0] + (b[0] - a[0]) * k;
      out[1] = a[1] + (b[1] - a[1]) * k;
      out[2] = a[2] + (b[2] - a[2]) * k;
    }
    var ramp = [0, 0, 0];

    for (i = 0; i < DISC_N; i++) {
      var x, y, z, bright2, sz2;
      if (i < DISC_N * 0.28) {
        // central bulge — flattened spheroid, warm amber
        x = g3() * R * 0.145;
        y = g3() * R * 0.145 * 0.52;
        z = g3() * R * 0.145;
        var warm = 0.30 + 0.34 * rand();
        dCol[i * 3] = 1.00 * warm; dCol[i * 3 + 1] = 0.85 * warm; dCol[i * 3 + 2] = 0.62 * warm;
        sz2 = (2600 + 10000 * Math.pow(rand(), 2.6)) * 1.15;
      } else {
        // exponential disc with a gentle 2-arm spiral pull
        var theta = rand() * 6.2832;
        var rr = -Math.log(1 - 0.985 * rand()) * 0.30 * R;
        if (rr > R) rr = R * (0.9 + rand() * 0.1);
        var lr = Math.log(Math.max(rr, R * 0.02) / (R * 0.05)) / 0.35;
        theta -= Math.sin(2.0 * (theta - lr)) * 0.14;
        var arm = 0.5 + 0.5 * Math.cos(2.0 * (theta - lr));
        x = Math.cos(theta) * rr;
        z = Math.sin(theta) * rr;
        y = g3() * TH * 0.33 * (0.55 + 0.45 * (1 - rr / R));
        discRamp(rr / R, ramp);
        bright2 = (0.28 + 0.44 * Math.pow(rand(), 1.4)) * (0.55 + 0.45 * arm);
        if (arm > 0.75 && rand() < 0.03) {          // pink HII knots along arms
          ramp[0] = 1.0; ramp[1] = 0.55; ramp[2] = 0.62; bright2 = 0.7;
        }
        dCol[i * 3] = ramp[0] * bright2;
        dCol[i * 3 + 1] = ramp[1] * bright2;
        dCol[i * 3 + 2] = ramp[2] * bright2;
        sz2 = 2600 + 10000 * Math.pow(rand(), 2.6);
      }
      // keep the very centre hollow — the solar system / BH / WH live inside
      var cl = Math.sqrt(x * x + y * y + z * z);
      if (cl < 2.3e5) {
        var cf = (2.3e5 + rand() * 4e4) / Math.max(cl, 1);
        x *= cf; y *= cf; z *= cf;
      }
      dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z;
      dSiz[i] = sz2;
      dPhs[i] = rand() * 6.2832;
    }

    var discGeo = new THREE.BufferGeometry();
    discGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    discGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));
    discGeo.setAttribute('aSize', new THREE.BufferAttribute(dSiz, 1));
    discGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPhs, 1));

    var discMat = makePointsMaterial(1.0, 12.0, 0.0);
    var disc = new THREE.Points(discGeo, discMat);
    disc.frustumCulled = false;
    disc.renderOrder = -3;
    spinGroup.add(disc);

    // ---- nebula sprites: soft canvas radial gradients, teal/rose/amber ----
    function makeNebulaTexture(base, accent) {
      var S = 256;
      var c = document.createElement('canvas');
      c.width = S; c.height = S;
      var g = c.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      function puff(col, px, py, pr, pa) {
        var gr = g.createRadialGradient(px, py, 0, px, py, pr);
        gr.addColorStop(0, 'rgba(' + col + ',' + pa.toFixed(3) + ')');
        gr.addColorStop(0.45, 'rgba(' + col + ',' + (pa * 0.38).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = gr;
        g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      puff(base, S / 2, S / 2, S * 0.46, 0.28);
      var k;
      for (k = 0; k < 6; k++) {
        puff(base, S / 2 + (rand() - 0.5) * S * 0.28, S / 2 + (rand() - 0.5) * S * 0.28,
             S * (0.10 + rand() * 0.20), 0.14 + rand() * 0.18);
      }
      for (k = 0; k < 3; k++) {
        puff(accent, S / 2 + (rand() - 0.5) * S * 0.22, S / 2 + (rand() - 0.5) * S * 0.22,
             S * (0.05 + rand() * 0.10), 0.20 + rand() * 0.18);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    var nebTex = [
      makeNebulaTexture('64,150,158', '120,210,205'),   // teal
      makeNebulaTexture('186,92,128', '232,150,170'),   // rose
      makeNebulaTexture('206,150,92', '240,196,130')    // amber
    ];

    var NEB_N = Q.tier === 'low' ? 6 : 9;
    for (i = 0; i < NEB_N; i++) {
      var nm = new THREE.SpriteMaterial({
        map: nebTex[i % 3],
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.15 + rand() * 0.16,
        rotation: rand() * 6.2832
      });
      var sp = new THREE.Sprite(nm);
      var an = (i / NEB_N) * 6.2832 + rand() * 0.7;
      var nr = 3.2e5 + rand() * 5.3e5;
      sp.position.set(Math.cos(an) * nr, (rand() - 0.5) * 7e4, Math.sin(an) * nr);
      var ns = 1.5e5 + rand() * 1.6e5;
      sp.scale.set(ns, ns, 1);
      sp.frustumCulled = false;
      sp.renderOrder = -2;
      spinGroup.add(sp);
    }

    // ==================================================================
    // 3. DEEP SKY — galaxy sprites clustered into cosmic-web filaments
    // ==================================================================
    function makeGalaxyAtlas() {
      var S = Q.texSize;                       // 1024 high / 512 low, POT
      var T = S / 2;
      var c = document.createElement('canvas');
      c.width = S; c.height = S;
      var g = c.getContext('2d');

      function blob(px, py, pr, col, pa) {
        var gr = g.createRadialGradient(px, py, 0, px, py, pr);
        gr.addColorStop(0, 'rgba(' + col + ',' + pa.toFixed(3) + ')');
        gr.addColorStop(0.55, 'rgba(' + col + ',' + (pa * 0.35).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = gr;
        g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      function speckles(cx, cy, rr, n) {
        var k;
        for (k = 0; k < n; k++) {
          var an = rand() * 6.2832, rd = Math.pow(rand(), 0.7) * rr;
          g.fillStyle = 'rgba(235,240,255,' + (0.25 + rand() * 0.5).toFixed(2) + ')';
          g.beginPath();
          g.arc(cx + Math.cos(an) * rd, cy + Math.sin(an) * rd * 0.82,
                Math.max(0.6, T * 0.004 * (0.5 + rand())), 0, 6.2832);
          g.fill();
        }
      }
      function spiral(cx, cy, arms, twist, hue) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        blob(cx, cy, T * 0.40, '150,170,225', 0.10);
        blob(cx, cy, T * 0.17, '255,235,205', 0.55);
        blob(cx, cy, T * 0.08, '255,248,235', 0.95);
        for (var a = 0; a < arms; a++) {
          var off = (a * 6.2832) / arms + rand() * 0.8;
          for (var t = 0; t < 3.2; t += 0.05) {
            var r = T * 0.085 * Math.exp(twist * t);
            if (r > T * 0.45) break;
            blob(cx + Math.cos(off + t) * r + (rand() - 0.5) * T * 0.012,
                 cy + Math.sin(off + t) * r * 0.88 + (rand() - 0.5) * T * 0.012,
                 T * (0.018 + 0.05 * (r / (T * 0.45))),
                 hue, 0.13 * (1.0 - 0.6 * t / 3.2));
          }
        }
        speckles(cx, cy, T * 0.40, 26);
        g.restore();
      }
      function elliptical(cx, cy, squash) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(cx, cy);
        g.scale(1, squash);
        blob(0, 0, T * 0.42, '255,238,216', 0.12);
        blob(0, 0, T * 0.26, '255,240,220', 0.30);
        blob(0, 0, T * 0.11, '255,246,232', 0.85);
        g.restore();
      }
      function edgeOn(cx, cy) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(cx, cy);
        g.save(); g.scale(1, 0.15);
        blob(0, 0, T * 0.46, '215,220,250', 0.50);
        blob(0, 0, T * 0.30, '255,240,218', 0.60);
        g.restore();
        g.save(); g.scale(1, 0.38);
        blob(0, 0, T * 0.12, '255,244,226', 0.90);
        g.restore();
        g.restore();
        // dust lane — erase a thin soft strip across the streak
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.translate(cx, cy + T * 0.008);
        g.scale(1, 0.045);
        var gr = g.createRadialGradient(0, 0, 0, 0, 0, T * 0.40);
        gr.addColorStop(0, 'rgba(0,0,0,0.70)');
        gr.addColorStop(0.7, 'rgba(0,0,0,0.35)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(-T * 0.45, -T * 10, T * 0.9, T * 20);
        g.restore();
      }

      spiral(T * 0.5, T * 0.5, 2, 0.64, '170,190,255');   // tile 0
      elliptical(T * 1.5, T * 0.5, 0.72);                 // tile 1
      edgeOn(T * 0.5, T * 1.5);                           // tile 2
      spiral(T * 1.5, T * 1.5, 3, 0.50, '200,185,240');   // tile 3

      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    var GAL_VERT = [
      'attribute float aSize;',
      'attribute vec3 aColor;',
      'attribute float aTile;',
      'attribute float aRot;',
      'attribute float aAlpha;',
      'uniform float uPxScale;',
      'uniform float uMaxPx;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'varying vec2 vTile;',
      'varying vec2 vRotCS;',
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'void main() {',
      '  vColor = aColor;',
      '  vAlpha = aAlpha;',
      '  vTile = vec2(mod(aTile, 2.0) * 0.5, 0.5 - floor(aTile * 0.5 + 0.25) * 0.5);',
      '  vRotCS = vec2(cos(aRot), sin(aRot));',
      '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
      '  float px = aSize * uPxScale / max(-mvPosition.z, 1e-3);',
      '  gl_PointSize = clamp(px, 1.5, uMaxPx);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  #include <logdepthbuf_vertex>',
      '}'
    ].join('\n');

    var GAL_FRAG = [
      'uniform sampler2D uMap;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'varying vec2 vTile;',
      'varying vec2 vRotCS;',
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  vec2 p = gl_PointCoord - 0.5;',
      '  vec2 q = vec2(p.x * vRotCS.x - p.y * vRotCS.y, p.x * vRotCS.y + p.y * vRotCS.x) + 0.5;',
      '  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;',
      '  vec4 tex = texture2D(uMap, vTile + vec2(q.x, 1.0 - q.y) * 0.5);',
      // texture is sRGB (auto-decoded to linear); re-encode so the authored
      // canvas look survives the raw-shader path with NoToneMapping
      '  vec3 col = pow(tex.rgb, vec3(0.4545)) * vColor;',
      '  gl_FragColor = vec4(col, vAlpha);',
      '}'
    ].join('\n');

    var GAL_N = Math.floor(2000 * Q.particleScale);
    var gPos = new Float32Array(GAL_N * 3);
    var gCol = new Float32Array(GAL_N * 3);
    var gSiz = new Float32Array(GAL_N);
    var gTil = new Float32Array(GAL_N);
    var gRot = new Float32Array(GAL_N);
    var gAlp = new Float32Array(GAL_N);

    var d3a = Math.pow(L.DEEPSKY.rMin, 3);
    var d3b = Math.pow(L.DEEPSKY.rMax, 3);

    // cosmic-web scaffold: nodes in the deep-sky shell, filaments between them
    var nodes = [];
    for (i = 0; i < 22; i++) {
      var nv = new THREE.Vector3(g3(), g3(), g3());
      if (nv.lengthSq() < 1e-8) nv.set(1, 0.1, 0.2);
      nv.normalize().multiplyScalar(Math.cbrt(d3a + (d3b - d3a) * rand()));
      nodes.push(nv);
    }
    var segs = [];
    var guard = 0;
    while (segs.length < 35 && guard++ < 500) {
      var na = nodes[Math.floor(rand() * nodes.length)];
      var nb = null, bd = Infinity;
      for (j = 0; j < 4; j++) {
        var cnd = nodes[Math.floor(rand() * nodes.length)];
        if (cnd === na) continue;
        var dd = cnd.distanceToSquared(na);
        if (dd < bd) { bd = dd; nb = cnd; }
      }
      if (!nb) continue;
      segs.push({ a: na, b: nb, len: Math.sqrt(bd) });
    }

    for (i = 0; i < GAL_N; i++) {
      var gx, gy, gz;
      if (segs.length && i < GAL_N * 0.82) {
        var sg = segs[i % segs.length];
        var t = rand();
        var sig = sg.len * 0.03 + 2.0e5;
        if (rand() < 0.3) {                       // cluster harder at the nodes
          t = rand() < 0.5 ? Math.pow(rand(), 2) * 0.15 : 1 - Math.pow(rand(), 2) * 0.15;
          sig *= 0.55;
        }
        gx = sg.a.x + (sg.b.x - sg.a.x) * t + g3() * sig;
        gy = sg.a.y + (sg.b.y - sg.a.y) * t + g3() * sig;
        gz = sg.a.z + (sg.b.z - sg.a.z) * t + g3() * sig;
      } else {                                    // sparse field population
        tmpV.set(g3(), g3(), g3());
        if (tmpV.lengthSq() < 1e-8) tmpV.set(0.3, 1, 0.1);
        tmpV.normalize().multiplyScalar(Math.cbrt(d3a + (d3b - d3a) * rand()));
        gx = tmpV.x; gy = tmpV.y; gz = tmpV.z;
      }
      var gl = Math.max(Math.sqrt(gx * gx + gy * gy + gz * gz), 1);
      if (gl < L.DEEPSKY.rMin) {
        var f1 = (L.DEEPSKY.rMin * (1.0 + rand() * 0.08)) / gl;
        gx *= f1; gy *= f1; gz *= f1;
      } else if (gl > L.DEEPSKY.rMax) {
        var f2 = L.DEEPSKY.rMax / gl;
        gx *= f2; gy *= f2; gz *= f2;
      }
      gPos[i * 3] = gx; gPos[i * 3 + 1] = gy; gPos[i * 3 + 2] = gz;

      var pr = rand();
      gTil[i] = pr < 0.34 ? 0 : (pr < 0.58 ? 1 : (pr < 0.80 ? 2 : 3));
      gRot[i] = rand() * 6.2832;

      var tr2 = rand(), tc;
      if (tr2 < 0.50) tc = [0.80, 0.86, 1.00];
      else if (tr2 < 0.75) tc = [1.00, 0.92, 0.78];
      else tc = [0.94, 0.94, 1.00];
      var tb = 0.8 + 0.5 * rand();
      gCol[i * 3] = tc[0] * tb; gCol[i * 3 + 1] = tc[1] * tb; gCol[i * 3 + 2] = tc[2] * tb;

      var gsz = 4.0e4 + 1.6e5 * Math.pow(rand(), 2.4);
      if (rand() < 0.03) gsz *= 1.8;
      gSiz[i] = gsz;
      gAlp[i] = 0.45 + 0.55 * rand();
    }

    var galGeo = new THREE.BufferGeometry();
    galGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    galGeo.setAttribute('aColor', new THREE.BufferAttribute(gCol, 3));
    galGeo.setAttribute('aSize', new THREE.BufferAttribute(gSiz, 1));
    galGeo.setAttribute('aTile', new THREE.BufferAttribute(gTil, 1));
    galGeo.setAttribute('aRot', new THREE.BufferAttribute(gRot, 1));
    galGeo.setAttribute('aAlpha', new THREE.BufferAttribute(gAlp, 1));

    var galMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: makeGalaxyAtlas() },
        uPxScale: { value: 1000 },
        uMaxPx: { value: 120 }
      },
      vertexShader: GAL_VERT,
      fragmentShader: GAL_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var galaxies = new THREE.Points(galGeo, galMat);
    galaxies.frustumCulled = false;
    galaxies.renderOrder = -3;
    ctx.world.add(galaxies);

    // ==================================================================
    // per-frame: time uniform, screen-space size scale, glacial disc spin
    // ==================================================================
    var starU = starMat.uniforms;
    var discU = discMat.uniforms;
    var galU = galMat.uniforms;

    var pxInit = ctx.state.pixelsPerUnit(1) * ctx.renderer.getPixelRatio();
    starU.uPxScale.value = pxInit;
    discU.uPxScale.value = pxInit;
    galU.uPxScale.value = pxInit;

    ctx.onUpdate(function (dt, state) {
      var dpr = ctx.renderer.getPixelRatio();
      var px = state.pixelsPerUnit(1) * dpr;
      starU.uTime.value = state.t;
      starU.uPxScale.value = px;
      starU.uMaxPx.value = 4 * dpr;              // contract: stars clamp [1, 4·dpr]
      discU.uPxScale.value = px;
      discU.uMaxPx.value = 7 * dpr;
      galU.uPxScale.value = px;
      galU.uMaxPx.value = Math.min(90 * dpr, 200);
      spinGroup.rotation.y += 0.00035 * dt * state.timeScale;
    });
  });
})();
