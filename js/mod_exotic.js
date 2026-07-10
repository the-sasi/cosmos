/* mod_exotic.js — black hole (horizon, Einstein-ring lensing billboard, doppler
   accretion disk) and wormhole (iridescent torus, swirling throat, infall
   particles, transit teleport). Positions from ctx.eph, sizes from ctx.layout. */
(function () {
  'use strict';

  COSMOS.register('exotic', function (ctx) {
    var THREE = ctx.THREE;
    var L = ctx.layout;
    var high = ctx.quality.tier === 'high';
    var world = ctx.world;

    // ------------------------------------------------------------------ GLSL
    var DEF_OCT = '#define OCT ' + (high ? 4 : 3) + '\n';

    var GLSL_NOISE = [
      'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
      'vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }',
      'float vnoise(vec2 p){',
      '  vec2 i = floor(p); vec2 f = fract(p);',
      '  vec2 u = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),',
      '             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);',
      '}',
      'float fbm(vec2 p){',
      '  float a = 0.5; float s = 0.0;',
      '  for (int i = 0; i < OCT; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }',
      '  return s;',
      '}',
      'vec2 rot2(vec2 p, float a){ float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }'
    ].join('\n');

    var VERT_UV = [
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  #include <logdepthbuf_vertex>',
      '}'
    ].join('\n');

    var VERT_POS = [
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'varying vec2 vPos;',
      'void main() {',
      '  vPos = position.xy;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  #include <logdepthbuf_vertex>',
      '}'
    ].join('\n');

    // ==================================================================
    // BLACK HOLE
    // ==================================================================
    var HOLE = L.BLACKHOLE.holeRadius;      // 20
    var DISK_OUT = L.BLACKHOLE.diskOuter;   // 90
    var DISK_IN = HOLE * 1.4;               // 28

    var bhGroup = new THREE.Group();
    world.add(bhGroup);

    // --- (a) event horizon: light does not come back out -------------------
    var horizon = new THREE.Mesh(
      new THREE.SphereGeometry(HOLE, high ? 48 : 32, high ? 32 : 22),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    bhGroup.add(horizon);

    // --- (b) lensing billboard: warped procedural starfield ----------------
    // deflection d' = d - k/d  (hole-radius units). Near the Einstein radius
    // sqrt(k) an annulus of screen maps to a tiny source patch, so point
    // stars smear into tangential arcs automatically.
    var LENS_SIZE = DISK_OUT * 7;                    // 630 units wide
    var EINSTEIN = 2.3;                              // in hole radii
    var lensFrag = [
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      DEF_OCT,
      GLSL_NOISE,
      'uniform float uHoleU;',
      'varying vec2 vUv;',
      'vec3 starLayer(vec2 q, float scale, float thr, float mag) {',
      '  vec2 g = q * scale;',
      '  vec2 cell = floor(g);',
      '  float h = hash12(cell + 19.19);',
      '  if (h < thr) { return vec3(0.0); }',
      '  vec2 f = g - cell;',
      '  vec2 sp = hash22(cell) * 0.8 + vec2(0.1);',
      '  float m = smoothstep(0.16, 0.0, length(f - sp));',
      '  vec3 tint = mix(vec3(0.72, 0.80, 1.0), vec3(1.0, 0.93, 0.82), fract(h * 3.71));',
      '  return tint * m * (0.35 + 0.65 * fract(h * 7.31)) * mag;',
      '}',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  vec2 p = (vUv - 0.5) * 2.0 * uHoleU;',
      '  float d = max(length(p), 1e-4);',
      '  vec2 dir = p / d;',
      '  float dp = d - ' + (EINSTEIN * EINSTEIN).toFixed(4) + ' / max(d, 0.05);',
      '  vec2 q = dir * dp;',
      '  float mag = clamp(sqrt(d / max(abs(dp), 0.2)), 1.0, 3.2);',
      '  vec3 col = starLayer(q, 1.4, 0.52, mag);',
      (high ? '  col += starLayer(q, 3.3, 0.30, mag) * 0.55;' : ''),
      '  float tp = (d - 1.55) * 3.0;',
      '  col += vec3(1.0, 0.88, 0.72) * exp(-tp * tp) * 0.5;',       // photon ring
      '  float te = (d - ' + EINSTEIN.toFixed(2) + ') * 1.8;',
      '  col += vec3(0.72, 0.78, 1.0) * exp(-te * te) * 0.22;',      // Einstein ring
      '  float shadow = 1.0 - smoothstep(1.34, 1.52, d);',
      '  float edge = 1.0 - smoothstep(0.70, 0.98, length(vUv - 0.5) * 2.0);',
      '  col *= edge * (1.0 - shadow);',
      '  float lum = max(col.r, max(col.g, col.b));',
      '  gl_FragColor = vec4(col, clamp(shadow + lum * 1.35, 0.0, 1.0));',
      '}'
    ].join('\n');

    var lensMat = new THREE.ShaderMaterial({
      uniforms: { uHoleU: { value: (LENS_SIZE * 0.5) / HOLE } },
      vertexShader: VERT_UV,
      fragmentShader: lensFrag,
      transparent: true,
      depthWrite: false
    });
    var lens = new THREE.Mesh(new THREE.PlaneGeometry(LENS_SIZE, LENS_SIZE), lensMat);
    lens.renderOrder = 5;
    bhGroup.add(lens);

    // --- (c) accretion disk: doppler-beamed, differentially sheared --------
    var diskFrag = [
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      DEF_OCT,
      GLSL_NOISE,
      'uniform float uTime;',
      'uniform float uDopA;',
      'uniform float uDopS;',
      'uniform float uRIn;',
      'uniform float uROut;',
      'varying vec2 vPos;',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  float r = max(length(vPos), 1e-3);',
      '  float ang = atan(vPos.y, vPos.x);',
      '  float w = 0.55 * pow(uRIn / r, 1.5);',                      // Keplerian shear
      '  vec2 q = rot2(vPos, -uTime * w);',
      '  float n = fbm(q * 0.05);',
      '  float rings = 0.6 + 0.4 * sin(r * 0.5 + (n - 0.5) * 8.0);',
      '  float tN = clamp((r - uRIn) / (uROut - uRIn), 0.0, 1.0);',
      '  vec3 col = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 0.62, 0.28), smoothstep(0.0, 0.45, tN));',
      '  col = mix(col, vec3(0.48, 0.13, 0.05), smoothstep(0.40, 1.0, tN));',
      '  float bright = mix(2.1, 0.14, pow(tN, 0.55));',
      '  bright *= 0.5 + 0.8 * rings * (0.45 + 0.8 * n);',
      '  float dop = uDopS * cos(ang - uDopA);',                     // approach > 0
      '  float beam = pow(clamp(1.0 + 0.85 * dop, 0.15, 1.9), 2.2);',
      '  col = mix(col, vec3(0.65, 0.76, 1.0), clamp(dop * 0.85, 0.0, 0.75));',
      '  col = mix(col, vec3(1.0, 0.30, 0.12), clamp(-dop * 0.8, 0.0, 0.6));',
      '  float fIn = smoothstep(uRIn, uRIn * 1.12, r);',
      '  float fOut = 1.0 - smoothstep(uROut * 0.62, uROut, r);',
      '  gl_FragColor = vec4(col * (bright * beam * fIn * fOut * fOut), 1.0);',
      '}'
    ].join('\n');

    var diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDopA: { value: 0 },
        uDopS: { value: 0 },
        uRIn: { value: DISK_IN },
        uROut: { value: DISK_OUT }
      },
      vertexShader: VERT_POS,
      fragmentShader: diskFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    var diskGroup = new THREE.Group();
    var disk = new THREE.Mesh(new THREE.RingGeometry(DISK_IN, DISK_OUT, high ? 96 : 64, 1), diskMat);
    disk.renderOrder = 6;
    diskGroup.add(disk);
    bhGroup.add(diskGroup);

    // ==================================================================
    // WORMHOLE
    // ==================================================================
    var WR = L.WORMHOLE.radius;             // 40
    var whAnchor = new THREE.Group();       // unrotated: labels/glints live here
    var whGroup = new THREE.Group();        // tilted: torus/throat/particles
    var qWh = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0.85, 0.0));
    var qWhInv = qWh.clone().invert();
    whGroup.quaternion.copy(qWh);
    whAnchor.add(whGroup);
    world.add(whAnchor);

    // --- iridescent torus ---------------------------------------------------
    var torusVert = [
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'varying float vAng;',
      'void main() {',
      '  vN = normalize(normalMatrix * normal);',
      '  vAng = atan(position.y, position.x);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '  #include <logdepthbuf_vertex>',
      '}'
    ].join('\n');
    var torusFrag = [
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      'uniform float uTime;',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'varying float vAng;',
      'vec3 hsl2rgb(vec3 c) {',
      '  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);',
      '  float ch = (1.0 - abs(2.0 * c.z - 1.0)) * c.y;',
      '  return (rgb - 0.5) * ch + c.z;',
      '}',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  vec3 n = normalize(vN);',
      '  vec3 v = normalize(vV);',
      '  float fr = pow(1.0 - abs(dot(n, v)), 2.2);',
      '  float hue = fract(0.58 + fr * 0.38 + 0.05 * sin(vAng * 3.0 + uTime * 0.22) + uTime * 0.01);',
      '  vec3 iri = hsl2rgb(vec3(hue, 0.68, 0.55));',
      '  float dif = max(dot(n, normalize(vec3(0.35, 0.65, 0.65))), 0.0);',
      '  vec3 col = vec3(0.045, 0.04, 0.10) + iri * (0.16 + 1.05 * fr) + vec3(0.10, 0.09, 0.16) * dif;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    var torusMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: torusVert,
      fragmentShader: torusFrag
    });
    var torus = new THREE.Mesh(
      new THREE.TorusGeometry(WR, WR * 0.16, high ? 20 : 14, high ? 96 : 64),
      torusMat
    );
    whGroup.add(torus);

    // --- swirling throat (window to "elsewhere") ----------------------------
    var THROAT_R = WR * 0.925;
    var throatFrag = [
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      DEF_OCT,
      GLSL_NOISE,
      'uniform float uTime;',
      'uniform vec2 uPar;',
      'uniform float uRad;',
      'varying vec2 vPos;',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  float rN = length(vPos) / uRad;',
      '  vec3 col = vec3(0.0);',
      '  float amp = 0.62;',
      '  for (int i = 0; i < ' + (high ? 3 : 2) + '; i++) {',
      '    float fi = float(i);',
      '    vec2 off = uPar * (8.0 + 13.0 * fi);',                    // view parallax
      '    float tw = (1.0 - rN) * (2.6 + 1.2 * fi) + uTime * (0.10 + 0.05 * fi);',
      '    vec2 q = rot2(vPos - off, tw) * (0.05 + 0.022 * fi);',
      '    float n = fbm(q + fi * 13.7);',
      '    col += mix(vec3(0.30, 0.16, 0.55), vec3(0.13, 0.72, 0.62), n) * (n * n * 1.9) * amp;',
      '    amp *= 0.72;',
      '  }',
      '  col += vec3(0.72, 0.95, 0.90) * exp(-rN * 4.2) * (0.75 + 0.25 * sin(uTime * 0.6));',
      '  col *= 1.0 - smoothstep(0.75, 1.0, rN) * 0.85;',
      '  gl_FragColor = vec4(col, 0.96 * (1.0 - smoothstep(0.90, 1.0, rN)));',
      '}'
    ].join('\n');
    var throatMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPar: { value: new THREE.Vector2() },
        uRad: { value: THROAT_R }
      },
      vertexShader: VERT_POS,
      fragmentShader: throatFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var throat = new THREE.Mesh(new THREE.CircleGeometry(THROAT_R, high ? 64 : 48), throatMat);
    throat.renderOrder = 4;
    whGroup.add(throat);

    // --- infall particles ----------------------------------------------------
    var N_PTS = Math.max(60, Math.round(600 * ctx.quality.particleScale));
    var posArr = new Float32Array(N_PTS * 3);   // (phase0, angle0, rand)
    var dataArr = new Float32Array(N_PTS * 3);  // (speed, side, worldSize)
    for (var i = 0; i < N_PTS; i++) {
      posArr[i * 3] = Math.random();
      posArr[i * 3 + 1] = Math.random() * Math.PI * 2;
      posArr[i * 3 + 2] = Math.random();
      dataArr[i * 3] = 0.5 + Math.random() * 0.9;
      dataArr[i * 3 + 1] = Math.random() * 2 - 1;
      dataArr[i * 3 + 2] = 0.25 + Math.random() * 0.6;
    }
    var ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    ptsGeo.setAttribute('aData', new THREE.BufferAttribute(dataArr, 3));
    ptsGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), WR * 3);

    var ptsVert = [
      '#include <common>',
      '#include <logdepthbuf_pars_vertex>',
      'attribute vec3 aData;',
      'uniform float uPhase;',
      'uniform float uR;',
      'uniform float uPt;',
      'uniform float uMaxPx;',
      'varying float vAlpha;',
      'varying float vMix;',
      'void main() {',
      '  float p = fract(position.x + uPhase * aData.x);',
      '  float rr = uR * mix(2.35, 0.10, pow(p, 0.75));',
      '  float ang = position.y + p * (6.5 + position.z * 2.5);',
      '  float zz = aData.y * uR * 0.55 * (1.0 - p) * (1.0 - p);',
      '  vec3 lp = vec3(cos(ang) * rr, sin(ang) * rr, zz);',
      '  vec4 mv = modelViewMatrix * vec4(lp, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  #include <logdepthbuf_vertex>',
      '  vAlpha = smoothstep(0.02, 0.14, p) * (1.0 - smoothstep(0.78, 0.98, p));',
      '  vMix = p;',
      '  gl_PointSize = clamp(uPt * aData.z / max(-mv.z, 0.1), 1.0, uMaxPx);',
      '}'
    ].join('\n');
    var ptsFrag = [
      '#include <common>',
      '#include <logdepthbuf_pars_fragment>',
      'varying float vAlpha;',
      'varying float vMix;',
      'void main() {',
      '  #include <logdepthbuf_fragment>',
      '  float a = smoothstep(0.5, 0.06, length(gl_PointCoord - vec2(0.5))) * vAlpha;',
      '  vec3 col = mix(vec3(0.30, 0.85, 0.78), vec3(0.72, 0.50, 1.0), vMix) * (0.65 + 0.7 * vMix);',
      '  gl_FragColor = vec4(col, a * 0.85);',
      '}'
    ].join('\n');
    var ptsMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0 },
        uR: { value: WR },
        uPt: { value: 800 },
        uMaxPx: { value: 7 * ctx.renderer.getPixelRatio() }
      },
      vertexShader: ptsVert,
      fragmentShader: ptsFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(ptsGeo, ptsMat);
    pts.renderOrder = 7;
    pts.frustumCulled = false;
    whGroup.add(pts);

    // ==================================================================
    // LABELS & FAR-VISIBILITY GLINTS
    // ==================================================================
    var bhLabel = ctx.makeTextSprite('BLACK HOLE — nothing below this surface can escape',
                                     { fontPx: 44, color: '#f0d8c6' });
    bhLabel.position.set(0, DISK_OUT * 1.35, 0);
    bhLabel.visible = false;
    bhGroup.add(bhLabel);

    var whLabel = ctx.makeTextSprite('WORMHOLE — hypothetical (Ellis metric)',
                                     { fontPx: 44, color: '#c6ece4' });
    whLabel.position.set(0, WR * 1.75, 0);
    whLabel.visible = false;
    whAnchor.add(whLabel);

    function makeGlint(inner, mid) {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0.0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.16, inner);
      grad.addColorStop(0.45, mid);
      grad.addColorStop(1.0, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthTest: true, depthWrite: false     // occluded by planets, like any star
      }));
      s.renderOrder = 45;
      return s;
    }
    var bhGlint = makeGlint('rgba(205,222,255,0.95)', 'rgba(135,165,255,0.30)');
    bhGroup.add(bhGlint);
    var whGlint = makeGlint('rgba(185,255,238,0.95)', 'rgba(150,132,255,0.30)');
    whAnchor.add(whGlint);

    // ==================================================================
    // PER-FRAME
    // ==================================================================
    var tmpA = new THREE.Vector3();
    var tmpB = new THREE.Vector3();
    var upY = new THREE.Vector3(0, 1, 0);
    var xA = new THREE.Vector3();
    var yA = new THREE.Vector3();
    var zA = new THREE.Vector3();
    var m4 = new THREE.Matrix4();
    var qPrec = new THREE.Quaternion();
    var qTmp = new THREE.Quaternion();
    var qTilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2 + 18 * Math.PI / 180, 0, 0));   // disk ~18° off ecliptic

    var precAngle = 0, diskT = 0, whT = 0, whPhase = 0;
    var cooldownUntil = -1;
    var LABEL_PX = 14;

    function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

    function updateMarkers(center, objRadius, label, labelYOff, glint, glintPx, state) {
      tmpA.copy(center).sub(state.camPos);
      var d = Math.max(tmpA.length(), 1e-6);
      var ppu = state.pixelsPerUnit(d);
      var objPx = objRadius * ppu;
      // label: screen-constant beacon — visible from anywhere in the solar
      // neighborhood so these objects are discoverable, not stumbled upon
      var show = state.labelsVisible && (objPx > 1.3 || state.viewWidthUnits < 8e5);
      label.visible = show;
      if (show) {
        tmpA.copy(center);
        tmpA.y += labelYOff;
        var dL = Math.max(tmpA.distanceTo(state.camPos), 1e-6);
        var h = LABEL_PX / state.pixelsPerUnit(dL);
        label.scale.set(h * label.userData.aspect, h, 1);
      }
      // glint: constant on-screen size from any distance, fades out up close.
      // Nudged toward the camera so its own horizon sphere/torus can't occlude it.
      tmpB.copy(center).sub(state.camPos).normalize().multiplyScalar(-objRadius * 1.6);
      glint.position.copy(tmpB);
      var s = glintPx / ppu;
      glint.scale.set(s, s, 1);
      var o = (1 - clamp01((objPx - 18) / 70)) * 0.9;
      glint.material.opacity = o;
      glint.visible = o > 0.02;
    }

    ctx.onUpdate(function (dt, state) {
      var ts = state.timeScale;
      var bh = ctx.eph.blackhole;
      var wh = ctx.eph.wormhole;

      bhGroup.position.copy(bh);
      whAnchor.position.copy(wh);

      // integrated shader clocks (world motion — scaled by timeScale)
      diskT += dt * ts;
      whT += dt * ts;
      whPhase += dt * ts * 0.06;
      diskMat.uniforms.uTime.value = diskT;
      torusMat.uniforms.uTime.value = whT;
      throatMat.uniforms.uTime.value = whT;
      ptsMat.uniforms.uPhase.value = whPhase;
      ptsMat.uniforms.uPt.value =
        ctx.renderer.domElement.height * 0.5 / Math.tan(ctx.camera.fov * Math.PI / 360);

      // slow disk precession
      precAngle += 0.012 * dt * ts;
      qPrec.setFromAxisAngle(upY, precAngle);
      diskGroup.quaternion.copy(qPrec).multiply(qTilt);

      // lensing billboard faces the camera with a stable roll
      zA.copy(state.camPos).sub(bh).normalize();
      xA.crossVectors(upY, zA);
      if (xA.lengthSq() < 1e-6) xA.set(1, 0, 0); else xA.normalize();
      yA.crossVectors(zA, xA);
      m4.makeBasis(xA, yA, zA);
      lens.quaternion.setFromRotationMatrix(m4);

      // doppler beaming: project view direction into the disk's local plane.
      // material at angle θ moves along (-sinθ, cosθ); approach speed toward
      // the camera peaks at uDopA, strength is 0 face-on and 1 edge-on.
      qTmp.copy(diskGroup.quaternion).invert();
      tmpB.copy(state.camPos).sub(bh).normalize().applyQuaternion(qTmp);
      var inPlane = Math.min(Math.sqrt(tmpB.x * tmpB.x + tmpB.y * tmpB.y), 1);
      diskMat.uniforms.uDopS.value = inPlane;
      diskMat.uniforms.uDopA.value = Math.atan2(-tmpB.x, tmpB.y);

      // throat parallax: local view direction, slight and layer-weighted
      tmpB.copy(state.camPos).sub(wh).normalize().applyQuaternion(qWhInv);
      throatMat.uniforms.uPar.value.set(tmpB.x, tmpB.y).multiplyScalar(0.45);

      // labels + glints
      updateMarkers(bh, DISK_OUT, bhLabel, DISK_OUT * 1.35, bhGlint, 6, state);
      updateMarkers(wh, WR, whLabel, WR * 1.75, whGlint, 5, state);

      // wormhole transit. The engine clamps the camera to radius+minAlt (54)
      // around the wormhole focus, so the literal radius/2 sphere is only
      // reachable in fly-bys; also trigger when the user zooms to the floor
      // while focused on the wormhole.
      tmpA.copy(wh).sub(state.camPos);
      var dw = tmpA.length();
      var dove = dw < WR * 0.5 ||
                 (state.focusName === 'wormhole' && state.camDist < WR + 15.5 && dw < WR * 1.6);
      if (dove && state.t > cooldownUntil) {
        cooldownUntil = state.t + 5;
        ctx.flash('#eaf4ff', 260);
        COSMOS.setFocusByName('saturn', { radiusMult: 5, quiet: true });
        ctx.toast('Wormhole transit — an Ellis throat would connect distant regions. (Entirely hypothetical.)', 8000);
      }
    });
  });
})();
