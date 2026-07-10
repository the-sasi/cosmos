/* mod_monuments.js — real mountains, towers and trenches at true scale, glued to Earth's spinning surface */
(function () {
  'use strict';

  COSMOS.register('monuments', function (ctx) {
    var THREE = ctx.THREE;

    // ---- catalogue (heights in km; negative = carved below the surface) ----
    var FEATURES = [
      { name: 'Everest',        h:  8.849,  lat:  27.99, lon:   86.93 },
      { name: 'K2',             h:  8.611,  lat:  35.88, lon:   76.51 },
      { name: 'Kilimanjaro',    h:  5.895,  lat:  -3.07, lon:   37.35 },
      { name: 'Denali',         h:  6.19,   lat:  63.07, lon: -151.00 },
      { name: 'Mont Blanc',     h:  4.81,   lat:  45.83, lon:    6.86 },
      { name: 'Burj Khalifa',   h:  0.828,  lat:  25.20, lon:   55.27 },
      { name: 'Eiffel Tower',   h:  0.33,   lat:  48.86, lon:    2.29 },
      { name: 'Great Pyramid',  h:  0.147,  lat:  29.98, lon:   31.13 },
      { name: 'Grand Canyon',   h: -1.86,   lat:  36.06, lon: -112.14 },
      { name: 'Dead Sea',       h: -0.43,   lat:  31.50, lon:   35.50,
        label: 'Dead Sea · 430 m below sea level' },
      { name: 'Mariana Trench', h: -10.935, lat:  11.35, lon:  142.20 },

      // India & Tamil Nadu
      { name: 'Kanchenjunga',   h:  8.586,  lat:  27.70, lon:   88.15,
        label: 'Kanchenjunga · 8.6 km — India’s highest' },
      { name: 'Anamudi',        h:  2.695,  lat:  10.17, lon:   77.06,
        label: 'Anamudi · 2.7 km — South India’s highest' },
      { name: 'Doddabetta',     h:  2.637,  lat:  11.40, lon:   76.74,
        label: 'Doddabetta · 2.6 km — Nilgiris, Tamil Nadu' },
      { name: 'Statue of Unity',h:  0.182,  lat:  21.84, lon:   73.72,
        label: 'Statue of Unity · 182 m — world’s tallest statue' },
      { name: 'Taj Mahal',      h:  0.073,  lat:  27.18, lon:   78.04 },
      { name: 'Brihadeeswarar Temple', h: 0.066, lat: 10.78, lon: 79.13,
        label: 'Brihadeeswarar Temple · 66 m — Thanjavur' },
      { name: 'Meenakshi Temple', h: 0.052, lat:   9.92, lon:   78.12,
        label: 'Meenakshi Temple · 52 m — Madurai' },

      // more of the world
      { name: 'Aconcagua',      h:  6.961,  lat: -32.65, lon:  -70.01 },
      { name: 'Mount Fuji',     h:  3.776,  lat:  35.36, lon:  138.73 },
      { name: 'Mauna Kea',      h:  4.207,  lat:  19.82, lon: -155.47,
        label: 'Mauna Kea · 10.2 km from the seafloor — taller than Everest' },
      { name: 'Angel Falls',    h:  0.979,  lat:   5.97, lon:  -62.54,
        label: 'Angel Falls · 979 m — tallest waterfall' },
      { name: 'Tokyo Skytree',  h:  0.634,  lat:  35.71, lon:  139.81 },
      { name: 'One World Trade Center', h: 0.541, lat: 40.71, lon: -74.01 },
      { name: 'Sydney Opera House', h: 0.065, lat: -33.86, lon: 151.22 },
      { name: 'Christ the Redeemer', h: 0.038, lat: -22.95, lon: -43.21 },
      { name: 'Kola Borehole',  h: -12.262, lat:  69.40, lon:   30.61,
        label: 'Kola Borehole · 12.2 km — deepest ever drilled' },
      { name: 'Lake Baikal',    h: -1.642,  lat:  53.50, lon:  108.05,
        label: 'Lake Baikal · 1.6 km — deepest lake' },

      { name: 'You',            h:  0.0017, lat:  27.99, lon:   86.94,
        human: true, label: 'You — 1.7 m' }
    ];

    function labelText(f) {
      if (f.label) return f.label;
      var a = Math.abs(f.h);
      var num = a >= 1 ? (a.toFixed(1) + ' km') : (Math.round(a * 1000) + ' m');
      return f.name + ' · ' + num + (f.h < 0 ? ' deep' : '');
    }

    // Standard equirectangular mapping (matches the NASA earth textures).
    function latLonToVec3(latDeg, lonDeg, r) {
      var phi = (90 - latDeg) * Math.PI / 180;
      var theta = (lonDeg + 180) * Math.PI / 180;
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
    }

    // ---- materials (shared) -------------------------------------------------
    // Up-features: warm matte gray, faceted like cut stone, sun-lit for free.
    var upMat = new THREE.MeshPhongMaterial({
      color: 0xb2a08b, emissive: 0x0d0a07,
      specular: 0x1c1a17, shininess: 8, flatShading: true
    });
    // Down-features: ghostly deep blue, drawn through the ground (they live
    // inside the planet, so depth testing would hide them entirely).
    var downMat = new THREE.MeshBasicMaterial({
      color: 0x2a679f, transparent: true, opacity: 0.62,
      depthTest: false, depthWrite: false
    });
    // The human: a warm-white speck, self-lit so "you" never disappear at night.
    var humanMat = new THREE.MeshBasicMaterial({ color: 0xffe3b8 });

    // ---- build --------------------------------------------------------------
    var root = new THREE.Group();
    root.name = 'monuments';
    var segs = ctx.quality.tier === 'low' ? 9 : 14;
    var UP = new THREE.Vector3(0, 1, 0);
    var items = [];

    for (var i = 0; i < FEATURES.length; i++) {
      var f = FEATURES[i];
      var dir = latLonToVec3(f.lat, f.lon, 1);          // unit surface normal (local)
      var hUnits = ctx.km(Math.abs(f.h));               // true-scale height, world units
      var sign = f.h < 0 ? -1 : 1;

      var anchor = new THREE.Group();
      anchor.quaternion.setFromUnitVectors(UP, dir);    // local +y = outward normal
      root.add(anchor);

      var geo, mesh, labelColor;
      if (f.human) {
        var rr = ctx.km(0.0005);                        // ~0.5 m radius
        geo = new THREE.CylinderGeometry(rr, rr, hUnits, 8);
        mesh = new THREE.Mesh(geo, humanMat);
        labelColor = '#ffd9a6';
      } else if (sign > 0) {
        geo = new THREE.ConeGeometry(hUnits * 0.35, hUnits, segs);
        mesh = new THREE.Mesh(geo, upMat);
        labelColor = '#e9e2d4';
      } else {
        geo = new THREE.ConeGeometry(hUnits * 0.35, hUnits, segs);
        geo.rotateX(Math.PI);                           // apex points into the Earth
        mesh = new THREE.Mesh(geo, downMat);
        mesh.renderOrder = 8;                           // after the opaque globe
        labelColor = '#a9c8e8';
      }
      mesh.position.y = 1 + sign * hUnits * 0.5;        // base anchored at surface r=1
      anchor.add(mesh);

      var sprite = ctx.makeTextSprite(labelText(f), { fontPx: 40, color: labelColor });
      sprite.visible = false;
      anchor.add(sprite);

      items.push({
        dir: dir, hUnits: hUnits, sign: sign, down: sign < 0,
        mesh: mesh, sprite: sprite, aspect: sprite.userData.aspect || 4
      });
    }

    /* ---- HOME beacon ------------------------------------------------------
       EDIT THE COORDINATES BELOW to your own house (lat, lon from any map).
       Rendered as a golden light-pillar so home is findable from orbit. */
    var HOME = { lat: 13.0827, lon: 80.2707, name: 'Home' };
    var homeDir = latLonToVec3(HOME.lat, HOME.lon, 1);
    var homeAnchor = new THREE.Group();
    homeAnchor.quaternion.setFromUnitVectors(UP, homeDir);
    root.add(homeAnchor);
    var homeDot = new THREE.Mesh(
      new THREE.SphereGeometry(ctx.km(1.2), 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27a })
    );
    homeDot.position.y = 1;
    homeAnchor.add(homeDot);
    var pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffc96b, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    var PILLAR_H = 0.02;                       // ~127 km tall waypoint beam
    var homePillar = new THREE.Mesh(
      new THREE.CylinderGeometry(ctx.km(0.4), ctx.km(1.6), PILLAR_H, 6, 1, true),
      pillarMat
    );
    homePillar.position.y = 1 + PILLAR_H / 2;
    homePillar.renderOrder = 9;
    homeAnchor.add(homePillar);
    var homeLabel = ctx.makeTextSprite('⌂ ' + HOME.name, { fontPx: 46, color: '#ffd27a' });
    homeLabel.visible = false;
    homeAnchor.add(homeLabel);
    // screen-facing glow so home reads from EVERY angle (a pillar seen from
    // directly above is edge-on and invisible)
    var homeGlow = (function () {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,210,122,0.9)');
      grad.addColorStop(0.6, 'rgba(255,180,80,0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthTest: true, depthWrite: false
      }));
      s.position.y = 1.0006;
      s.renderOrder = 10;
      homeAnchor.add(s);
      return s;
    })();
    var homeSx = -1, homeSy = -1, homeOn = false;

    // Glue to the spinning Earth. mod_earth builds first, but stay defensive.
    var surfRef = null;
    function tryAttach() {
      var s = ctx.shared.earthSurface;
      if (!s) return false;
      s.add(root);
      surfRef = s;
      return true;
    }
    tryAttach();

    // ---- click a marker/label: dive down to it + size-comparison panel ------
    var dirW = new THREE.Vector3();
    function fmtH(h) {
      var a = Math.abs(h);
      return (a >= 1 ? a.toFixed(1) + ' km' : Math.round(a * 1000) + ' m') + (h < 0 ? ' deep' : '');
    }
    function panelHTML(f) {
      var comps = [
        { n: 'You', h: 0.0017 },
        { n: 'Burj Khalifa', h: 0.828 },
        { n: f.name, h: Math.abs(f.h), hero: true, deep: f.h < 0 },
        { n: 'Everest', h: 8.849 },
        { n: 'Mariana Trench', h: 10.935, deep: true }
      ];
      var max = 10.935;
      var rows = comps.map(function (c) {
        var w = Math.max(100 * c.h / max, 0.8);
        return '<div class="row' + (c.hero ? ' hero' : '') + (c.deep ? ' deep' : '') + '">' +
          '<span class="nm">' + c.n + '</span>' +
          '<span class="bar" style="width:' + w.toFixed(1) + '%"></span>' +
          '<span class="v">' + fmtH(c.h) + '</span></div>';
      }).join('');
      var pct = (Math.abs(f.h) / 6371 * 100);
      return '<h3>' + f.name + '</h3>' +
        '<div class="sub">' + labelText(f) + '</div>' + rows +
        '<div class="note">' + (f.h === 0.0017
          ? 'This is you. Everything else on this chart is thousands of times taller — and even Everest is 0.14% of Earth\'s radius.'
          : 'At true scale this is ' + (pct < 0.01 ? pct.toFixed(4) : pct.toFixed(2)) +
            '% of Earth\'s radius. Press E to toggle honesty.') + '</div>';
    }
    ctx.onClick(function (x, y) {
      if (!surfRef || !root.visible) return false;
      if (homeOn && Math.hypot(homeSx - x, homeSy - y) < 26) {
        dirW.copy(homeDir).transformDirection(surfRef.matrixWorld);
        COSMOS.focusEarthPoint(dirW, 0.004);
        ctx.showInfo('<h3>⌂ ' + HOME.name + '</h3><div class="sub">' +
          HOME.lat.toFixed(4) + '°, ' + HOME.lon.toFixed(4) + '°</div>' +
          '<div class="note">From this rooftop you just zoomed to the edge of the observable universe. ' +
          'Everything you have ever known happened inside one pixel of that view.</div>');
        return true;
      }
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.sx && it.sx !== 0) continue;
        if (!it.onScreen) continue;
        if (Math.hypot(it.sx - x, it.sy - y) < 22) {
          dirW.copy(it.dir).transformDirection(surfRef.matrixWorld);
          var alt = Math.max(it.hUnits * ctx.state.exaggeration * 3.2, 0.0025);
          COSMOS.focusEarthPoint(dirW, alt);
          ctx.showInfo(panelHTML(FEATURES[i]));
          return true;
        }
      }
      return false;
    });

    // ---- per-frame ----------------------------------------------------------
    var tmpA = new THREE.Vector3();   // feature surface point (render space)
    var tmpB = new THREE.Vector3();   // feature normal (render space)
    var tmpC = new THREE.Vector3();   // earth centre (render space)
    var tmpD = new THREE.Vector3();   // scratch for screen projection
    var camDir = new THREE.Vector3(); // earth centre -> camera
    var toastShown = false;
    var LABEL_PX = 14;
    var NEAR_DIST = 320;              // beyond this Everest×75 is sub-pixel anyway
    var accX = new Float32Array(64), accY = new Float32Array(64);

    ctx.onUpdate(function (dt, state) {
      if (!surfRef && !tryAttach()) return;

      // One-time whisper the first time the viewer gets truly close — to EARTH.
      if (!toastShown && state.focusName === 'earth' && state.altitude < 0.05) {
        toastShown = true;
        ctx.toast('Every marker here — every mountain, tower and trench that humans call vast — ' +
          (ctx.quality.isMobile ? 'tap the ⛰ terrain button' : 'press E') +
          ', then zoom out and watch them vanish.', 9000);
      }

      // Global gate: skip all work unless the camera is near Earth.
      tmpA.copy(ctx.eph.earth).sub(state.camPos);
      var near = tmpA.length() < NEAR_DIST;
      if (root.visible !== near) root.visible = near;
      if (!near) return;

      var exag = state.exaggeration;
      var scrW = ctx.renderer.domElement.clientWidth;
      var scrH = ctx.renderer.domElement.clientHeight;
      var mw = surfRef.matrixWorld;               // render space (camera at origin)
      tmpC.setFromMatrixPosition(mw);             // earth centre, render space
      var cLen = tmpC.length();
      if (cLen > 1e-9) camDir.copy(tmpC).multiplyScalar(-1 / cLen);
      else camDir.set(0, 0, 1);

      var labelsOn = state.labelsVisible && state.altitude < 0.55;

      // HOME beacon: pulse + a label that never hides while Earth is near
      pillarMat.opacity = 0.32 + 0.2 * Math.sin(state.t * 2.4);
      tmpA.copy(homeDir).applyMatrix4(mw);
      tmpB.copy(tmpA).sub(tmpC).normalize();
      var homeFace = tmpB.dot(camDir);
      tmpD.copy(tmpA).project(ctx.camera);
      homeOn = homeFace > 0.05 && tmpD.z <= 1;
      homeSx = (tmpD.x * 0.5 + 0.5) * scrW;
      homeSy = (-tmpD.y * 0.5 + 0.5) * scrH;
      var hD = Math.max(tmpA.length(), 1e-9);
      var hv = state.labelsVisible && homeFace > 0.08 && hD < 6;
      if (hv) {
        var hwh = 15 / state.pixelsPerUnit(hD);
        homeLabel.position.y = 1 + PILLAR_H + hwh * 1.4;
        homeLabel.scale.set(hwh * homeLabel.userData.aspect, hwh, 1);
      }
      if (homeLabel.visible !== hv) homeLabel.visible = hv;
      var gs = 14 / state.pixelsPerUnit(hD);           // 14 px glow, any distance
      homeGlow.scale.set(gs, gs, 1);
      homeGlow.material.opacity = 0.55 + 0.3 * Math.sin(state.t * 2.4);
      homeGlow.visible = homeFace > 0.02;

      for (var j = 0; j < items.length; j++) {
        var it = items[j];

        // Uniform exaggeration, base pinned to the surface. (Vertical-only would
        // leave Everest a 663 km tall but 3 km — sub-pixel — wide needle.)
        it.mesh.scale.set(exag, exag, exag);
        it.mesh.position.y = 1 + it.sign * it.hUnits * exag * 0.5;

        // Which side of the planet is this feature on?
        tmpA.copy(it.dir).applyMatrix4(mw);       // surface point, render space
        tmpB.copy(tmpA).sub(tmpC).normalize();    // outward normal, render space
        var facing = tmpB.dot(camDir);

        // screen position for click hit-testing
        tmpD.copy(tmpA).project(ctx.camera);
        it.onScreen = facing > 0.05 && tmpD.z <= 1;
        it.sx = (tmpD.x * 0.5 + 0.5) * scrW;
        it.sy = (-tmpD.y * 0.5 + 0.5) * scrH;

        // Ghost trenches only show on the near hemisphere (they ignore depth).
        if (it.down) {
          var dv = facing > -0.02;
          if (it.mesh.visible !== dv) it.mesh.visible = dv;
        }

        // Label candidacy — placement happens in the overlap-filtered pass below.
        // Screen margins keep labels off the HUD (scale bar, hints, title).
        it.labelOK = false;
        if (labelsOn && facing > 0.15 &&
            it.sx > 40 && it.sx < scrW - 40 && it.sy > 34 && it.sy < scrH - 90) {
          var camD = tmpA.length();
          if (camD < 6 && camD > 1e-9) { it.labelOK = true; it.labelD = camD; }
        }
      }

      // greedy anti-overlap: home first, then catalogue order (famous first)
      var accN = 0;
      if (homeLabel.visible) { accX[0] = homeSx; accY[0] = homeSy; accN = 1; }
      for (var k = 0; k < items.length; k++) {
        var it2 = items[k];
        var lv = it2.labelOK && it2.onScreen;
        if (lv) {
          for (var a = 0; a < accN; a++) {
            if (Math.abs(accX[a] - it2.sx) < 150 && Math.abs(accY[a] - it2.sy) < 20) { lv = false; break; }
          }
        }
        if (lv) {
          accX[accN] = it2.sx; accY[accN] = it2.sy; accN++;
          var wh = LABEL_PX / state.pixelsPerUnit(it2.labelD);
          var topY = 1 + (it2.sign > 0 ? it2.hUnits * exag : 0);
          it2.sprite.position.y = topY + wh * 1.35;
          it2.sprite.scale.set(wh * it2.aspect, wh, 1);
        }
        if (it2.sprite.visible !== lv) it2.sprite.visible = lv;
      }
    });
  });
})();
