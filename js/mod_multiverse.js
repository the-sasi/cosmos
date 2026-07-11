/* mod_multiverse.js — the whole multiverse inside ONE continuous universe.
   Category clusters (Anime, Movies, Games, Mythology, ...) are regions of the
   deep sky; each contains themed galaxies; each galaxy contains worlds.
   Separation is spatial, never tabs. Distance-culling keeps it lightweight:
   a galaxy is just two sprites until you actually approach it. */
(function () {
  'use strict';

  COSMOS.register('galaxies', function (ctx) {
    var THREE = ctx.THREE;
    var TS = ctx.quality.texSize / 2;

    /* ---------------------- tiny procedural toolkit ----------------------- */
    function hash(x, y, s) {
      var h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
      return h - Math.floor(h);
    }
    function vnoise(x, y, s) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
      var c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, s, oct) {
      var v = 0, amp = 0.55, f = 1;
      for (var i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 13) * amp; amp *= 0.5; f *= 2.1; }
      return v;
    }
    function lerpC(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    function ramp(stops, t) {
      if (t <= stops[0][0]) return stops[0][1];
      for (var i = 0; i < stops.length - 1; i++) {
        var a = stops[i], b = stops[i + 1];
        if (t <= b[0]) return lerpC(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
      return stops[stops.length - 1][1];
    }
    function makeTex(w, h, paint) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      var img = g.createImageData(w, h);
      var d = img.data, p = 0;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var col = paint(x / w, y / h);
          d[p++] = col[0]; d[p++] = col[1]; d[p++] = col[2]; d[p++] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    }
    // two-color noise world texture — the generic look for tribute worlds
    function duoTex(dark, light, fx, seed, islands) {
      return makeTex(TS, TS / 2, function (u, v) {
        var n = fbm(u * fx, v * fx * 0.6, seed, 4);
        var col = lerpC(dark, light, Math.max(0, Math.min(1, (n - 0.3) * 2.2)));
        if (islands && n > 0.78) col = islands;
        return col;
      });
    }
    // richer world painter: oceans with depth, continents with relief and
    // shorelines, ragged polar caps — no more colored balls
    function worldTexPro(dark, lite, seed, opts) {
      opts = opts || {};
      var sea = opts.sea || null;
      var cap = opts.cap !== false;
      return makeTex(TS, TS / 2, function (u, v) {
        var n = fbm(u * 6, v * 4, seed, 4);
        var d2 = fbm(u * 19, v * 13, seed + 7, 3);
        var col;
        if (sea) {
          if (n < 0.52) {
            col = lerpC([sea[0] * 0.35, sea[1] * 0.4, sea[2] * 0.5], sea,
                        Math.max(0, Math.min(1, n * 1.7)));
          } else {
            col = lerpC(dark, lite, Math.min(1, (n - 0.52) * 3.2));
            col = lerpC(col, [col[0] * 0.72, col[1] * 0.74, col[2] * 0.72], d2 * 0.75);
          }
        } else {
          col = lerpC(dark, lite, Math.max(0, Math.min(1, (n - 0.3) * 2.2)));
          col = lerpC(col, [col[0] * 0.7, col[1] * 0.72, col[2] * 0.76], d2 * 0.55);
        }
        if (cap) {
          var pole = Math.abs(v - 0.5) * 2;
          var edge = 0.78 + 0.1 * fbm(u * 9, 0.5, seed + 13, 2);
          if (pole > edge) col = lerpC(col, [236, 243, 250], Math.min(1, (pole - edge) * 8));
        }
        return col;
      });
    }
    // soft procedural cloud layer with real alpha
    function cloudTex(seed) {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      var g = c.getContext('2d');
      var img = g.createImageData(128, 64);
      var d = img.data, p = 0;
      for (var y = 0; y < 64; y++) {
        for (var x = 0; x < 128; x++) {
          var n = fbm(x / 128 * 7, y / 64 * 4, seed, 4);
          var a = Math.min(1, Math.max(0, (n - 0.55) * 3.4)) * 235;
          d[p++] = 255; d[p++] = 255; d[p++] = 255; d[p++] = a;
        }
      }
      g.putImageData(img, 0, 0);
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    }
    function rampTex(stops, fx, fy, seed, extra) {
      return makeTex(TS, TS / 2, function (u, v) {
        var n = fbm(u * fx, v * fy, seed, 4);
        var col = ramp(stops, n);
        if (extra) col = extra(u, v, n, col);
        return col;
      });
    }
    function radial(stops) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    function glow(stops, scale, opacity) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radial(stops), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: opacity || 0.8
      }));
      s.scale.set(scale, scale, 1);
      return s;
    }
    function latLon(lat, lon, r) {
      var phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
      return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi),
                                r * Math.sin(phi) * Math.sin(th));
    }
    function mkLabel(parent, text, color, pos, h) {
      var s = ctx.makeTextSprite(text, { fontPx: 44, color: color });
      s.scale.set(h * s.userData.aspect, h, 1);
      s.position.copy(pos);
      parent.add(s);
      return s;
    }

    /* ------------- natural scatter — categories are metadata only ---------- */
    // Galaxies are strewn across the sky at wildly different distances and
    // sizes. Nothing announces what any of them holds: a galaxy is only a
    // catalog code until you arrive. Discovery is the gameplay, and it is
    // remembered across sessions. (def.cat survives as engine metadata only.)
    var GXI = 0;
    function scatterPos(i) {
      var u = hash(i, 3, 71) * 2 - 1;
      var t = hash(i, 5, 73) * Math.PI * 2;
      var s = Math.sqrt(1 - u * u);
      var r = 1.3e6 * Math.pow(13, hash(i, 7, 79));   // 1.3e6 .. ~1.7e7: near & far
      return new THREE.Vector3(s * Math.cos(t) * r, u * r * 0.55, s * Math.sin(t) * r);
    }
    function catalogCode(i) { return 'GX-' + (1009 + ((i * 613) % 8987)); }
    var discovered = {};
    try { discovered = JSON.parse(localStorage.getItem('cosmos-discovered') || '{}'); }
    catch (e) { discovered = {}; }
    function saveDiscovered() {
      try { localStorage.setItem('cosmos-discovered', JSON.stringify(discovered)); } catch (e) {}
    }

    /* -------------------------- galaxy factory ---------------------------- */
    var galaxies = [];
    var NEAR_SHOW = 6e5;         // full content appears within this distance

    function buildGalaxy(def) {
      var idx = GXI++;
      var C = scatterPos(idx);
      var code = catalogCode(idx);
      var known = !!discovered[def.id];
      var g = new THREE.Group();          // near content (hidden until close)
      g.position.copy(C);
      g.visible = false;
      ctx.world.add(g);

      // size and brilliance vary wildly — some giants, some barely-there
      var R = def.cloudR || (7e3 + 2.8e4 * hash(idx, 9, 83));
      var n = Math.floor((def.detailed ? 3000 : 2000) * ctx.quality.particleScale) + 250;
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var t = Math.random() * Math.PI * 2;
        var rr = R * Math.pow(Math.random(), 0.55);
        pos[i * 3] = Math.cos(t) * rr;
        pos[i * 3 + 1] = (Math.random() - 0.5) * R * 0.22 * (1 - rr / R + 0.15);
        pos[i * 3 + 2] = Math.sin(t) * rr;
        var cc = def.starColors[(Math.random() * def.starColors.length) | 0];
        var br = 0.45 + Math.random() * 0.55;
        col[i * 3] = cc[0] * br; col[i * 3 + 1] = cc[1] * br; col[i * 3 + 2] = cc[2] * br;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      var cloud = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.8, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0.9, depthWrite: false
      }));
      cloud.frustumCulled = false;
      cloud.rotation.set((hash(C.x, 1, 9) - 0.5) * 1.2, 0, (hash(C.z, 2, 9) - 0.5) * 1.2);
      g.add(cloud);

      var nebs = [];
      (def.nebulae || []).forEach(function (nb, i) {
        var sp = glow([[0, nb[0]], [0.55, nb[1]], [1, 'rgba(0,0,0,0)']], R * (1.1 + i * 0.4), nb[2]);
        sp.position.set((hash(i, 1, 5) - 0.5) * R, (hash(i, 2, 5) - 0.5) * R * 0.4,
                        (hash(i, 3, 5) - 0.5) * R);
        g.add(sp);
        nebs.push({ s: sp, o: nb[2] });
      });

      var starR = def.starR || 42;
      var star = new THREE.Mesh(
        new THREE.SphereGeometry(starR, 40, 26),
        new THREE.MeshBasicMaterial({ color: def.starColor || 0xfff0d0 })
      );
      g.add(star);
      var halo = glow([[0, def.glow0], [0.4, def.glow1], [1, 'rgba(0,0,0,0)']], starR * 7, 0.9);
      g.add(halo);
      var light = new THREE.PointLight(0xffffff, 1.5, R * 4, 0);
      g.add(light);

      // far representation: one core glow + one beacon — 2 sprites, that's all
      var bright = 0.35 + 0.45 * hash(idx, 11, 89);
      var core = glow([[0, def.glow0], [0.4, def.glow1], [1, 'rgba(0,0,0,0)']], R * 1.7, bright);
      core.position.copy(C);
      ctx.world.add(core);
      // anonymous until visited: the code sprite is all the sky admits to
      var beaconCode = ctx.makeTextSprite('✦ ' + code, { fontPx: 38, color: '#7d89a3' });
      beaconCode.position.copy(C).y += R * 1.5;
      ctx.world.add(beaconCode);
      var beaconName = ctx.makeTextSprite('✦ ' + def.name, { fontPx: 44, color: def.accent });
      beaconName.position.copy(C).y += R * 1.5;
      beaconName.visible = false;
      ctx.world.add(beaconName);

      var gf = { name: def.id, label: known ? def.name : code, radius: R, minAlt: R * 0.22,
        parent: 'sun', beacon: true, getPosition: function () { return C; } };
      ctx.registerFocus(gf);
      ctx.registerFocus({ name: def.id + '-star', label: def.starLabel || 'The Star',
        radius: starR, minAlt: starR * 0.5, parent: def.id,
        getPosition: (function (p) { return function () { return p; }; })(C.clone()) });
      // the arrival fact stays generic until the galaxy is actually discovered
      ctx.addFact(def.id, known ? def.arrive
        : 'Uncharted. The catalog lists it as ' + code + ' — nothing more is known. Go closer.');
      if (def.facts) Object.keys(def.facts).forEach(function (k) { ctx.addFact(k, def.facts[k]); });

      var gx = { id: def.id, name: def.name, arrive: def.arrive, C: C, group: g,
                 cloud: cloud, R: R, focus: gf, known: known, idx: idx,
                 accent: def.accent, built: false,
                 codeSprite: beaconCode, nameSprite: beaconName,
                 aspectCode: beaconCode.userData.aspect,
                 aspectName: beaconName.userData.aspect,
                 spinners: [], customs: [], nebs: nebs };

      (def.worlds || []).forEach(function (w, wi) {
        var off = w.offset || [
          (hash(wi, 4, 8) - 0.5) * 1400 + 380 * (wi + 1) * (wi % 2 ? -1 : 1),
          (hash(wi, 5, 8) - 0.5) * 120,
          (hash(wi, 6, 8) - 0.5) * 1400
        ];
        var lp = new THREE.Vector3().fromArray(off);
        var mesh;
        if (w.ring) {
          mesh = new THREE.Mesh(
            new THREE.TorusGeometry(w.r, w.r * 0.06, 10, 64),
            new THREE.MeshPhongMaterial({ color: w.color || 0x9aa89a, shininess: 30 })
          );
          mesh.rotation.x = 1.1;
        } else if (w.ico) {
          mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(w.r, 1),
            new THREE.MeshPhongMaterial({ color: w.color, flatShading: true,
              shininess: 90, specular: new THREE.Color(0xffffff) })
          );
        } else {
          mesh = new THREE.Mesh(
            new THREE.SphereGeometry(w.r, 36, 24),
            new THREE.MeshPhongMaterial({ map: w.tex, shininess: w.shin || 10,
              specular: new THREE.Color(w.spec || 0x222222) })
          );
        }
        mesh.position.copy(lp);
        g.add(mesh);
        mkLabel(g, w.label, def.accent, lp.clone().add(new THREE.Vector3(0, w.r * 1.9, 0)), w.r * 0.42);
        (w.surfLabels || []).forEach(function (v) {
          mkLabel(mesh, v[0], '#ffe2c8', latLon(v[1], v[2], 1.15), 0.11);
        });
        if (w.shardRing) {
          var RN = Math.floor(500 * ctx.quality.particleScale) + 80;
          var rp = new Float32Array(RN * 3);
          for (var ri = 0; ri < RN; ri++) {
            var a = Math.random() * Math.PI * 2, rr2 = w.r * 1.6 + Math.random() * w.r * 0.8;
            rp[ri * 3] = Math.cos(a) * rr2;
            rp[ri * 3 + 1] = (Math.random() - 0.5) * 0.6;
            rp[ri * 3 + 2] = Math.sin(a) * rr2;
          }
          var rg = new THREE.BufferGeometry();
          rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
          var ring = new THREE.Points(rg, new THREE.PointsMaterial({
            color: 0xd8ecff, size: 2, sizeAttenuation: false,
            transparent: true, opacity: 0.8, depthWrite: false
          }));
          ring.frustumCulled = false;
          ring.position.copy(lp);
          g.add(ring);
          gx.spinners.push([ring, 0.01]);
        }
        var abs = C.clone().add(lp);
        ctx.registerFocus({ name: w.name, label: w.label, radius: w.r,
          parent: def.id + '-star', getPosition: function () { return abs; } });
        gx.spinners.push([mesh, w.spin || 0.06]);
        // hand-crafted world details (floating mountains, sky islands, life)
        if (w.custom) { try { w.custom(mesh, lp, gx, g); } catch (e) {} }
      });

      galaxies.push(gx);
    }

    /* ============================ THE CATALOGUE =========================== */
    // Fan tributes: names and one-line homages only; all visuals procedural.

    var warm = [[1, 0.85, 0.6], [1, 0.7, 0.4], [0.85, 0.9, 1]];
    var cool = [[0.7, 0.9, 1], [0.85, 0.95, 1], [1, 0.95, 0.8]];
    var ember = [[1, 0.75, 0.65], [0.95, 0.85, 0.8], [0.75, 0.75, 1]];
    var iceW = [[0.75, 0.95, 1], [0.9, 0.9, 1], [1, 1, 1]];

    // ---- ANIME ----
    buildGalaxy({
      cat: 'anime', id: 'gx-dragonball', name: 'Dragon Ball Galaxy', accent: '#ffcf8a',
      detailed: true, cloudR: 2.2e4, starColors: warm, starR: 55, starColor: 0xffd9a0,
      starLabel: 'A Warm Star', glow0: 'rgba(255,215,150,0.9)', glow1: 'rgba(255,140,60,0.28)',
      nebulae: [['rgba(255,150,60,0.18)', 'rgba(255,90,40,0.05)', 0.5]],
      arrive: 'The Dragon Ball galaxy — a fan tribute. Somewhere in here, seven spheres are waiting.',
      facts: {
        'db-namek': 'Namek — green skies, blue grass, and elders who remember the first wish.',
        'db-vegeta': 'Planet Vegeta — a heavy world of heavy-gravity warriors. It did not survive its king\'s pride.',
        'db-kaio': 'King Kai\'s world — barely a kilometre across, ten times the gravity, one road, one car.'
      },
      worlds: [
        { name: 'db-namek', label: 'Namek', r: 4.2, offset: [400, 10, 130],
          tex: rampTex([[0.3, [26, 84, 96]], [0.48, [40, 140, 110]], [0.62, [96, 190, 120]], [0.8, [150, 220, 150]]], 7, 4, 7) },
        { name: 'db-vegeta', label: 'Planet Vegeta', r: 5, offset: [-640, 40, 380],
          tex: rampTex([[0.3, [70, 28, 22]], [0.5, [130, 55, 35]], [0.68, [185, 95, 55]], [0.85, [220, 150, 100]]], 6, 3.5, 11) },
        { name: 'db-earth', label: 'Earth (theirs)', r: 4, offset: [820, -30, -540],
          tex: rampTex([[0.3, [16, 40, 90]], [0.5, [22, 70, 140]], [0.6, [60, 130, 80]], [0.8, [140, 180, 120]]], 8, 5, 17),
          surfLabels: [['Kame House', 5, -140], ['West City', 30, -110], ['Korin Tower', 15, -95]] },
        { name: 'db-kaio', label: "King Kai's World", r: 0.6, offset: [150, 70, -90],
          tex: rampTex([[0.3, [40, 110, 40]], [0.6, [90, 170, 70]], [0.9, [150, 210, 110]]], 14, 9, 23) }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-naruto', name: 'Shinobi Galaxy', accent: '#ff9d86',
      detailed: true, cloudR: 1.7e4, starColors: ember, starR: 45, starColor: 0xffe0b8,
      starLabel: 'The Shinobi Sun', glow0: 'rgba(255,170,130,0.9)', glow1: 'rgba(220,70,50,0.25)',
      nebulae: [['rgba(230,80,50,0.15)', 'rgba(120,30,40,0.04)', 0.5]],
      arrive: 'The Shinobi galaxy — a fan tribute. One planet, five great nations, and a moon with a secret.',
      facts: {
        'nar-world': 'The shinobi world — five great nations under one restless sky. Its wars were ended by children.',
        'nar-moon': 'In the stories, this moon is a seal — a prison for something that should never wake.'
      },
      worlds: [
        { name: 'nar-world', label: 'The Shinobi World', r: 5, offset: [420, -20, 260], spin: 0.05,
          tex: rampTex([[0.3, [22, 52, 92]], [0.5, [30, 80, 120]], [0.58, [78, 120, 70]], [0.72, [120, 140, 80]], [0.86, [170, 160, 120]]], 6, 4, 21),
          surfLabels: [['Konoha', 26, 30], ['Suna', 8, -25], ['Kiri', -5, 95], ['Kumo', 45, 70], ['Iwa', 35, -60]] },
        { name: 'nar-moon', label: 'The Sealed Moon', r: 1.3, offset: [464, -12, 234],
          tex: duoTex([90, 85, 100], [190, 184, 200], 9, 31) }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-onepiece', name: 'Grand Line Galaxy', accent: '#8fd4ff',
      detailed: true, cloudR: 1.8e4, starColors: cool, starR: 48, starColor: 0xfff2cf,
      starLabel: 'The Pirate Star', glow0: 'rgba(160,220,255,0.9)', glow1: 'rgba(40,140,220,0.25)',
      nebulae: [['rgba(60,170,230,0.15)', 'rgba(20,80,140,0.04)', 0.5]],
      arrive: 'The Grand Line galaxy — a fan tribute. An ocean without end, one treasure at the end of it.',
      facts: {
        'op-blue': 'A world that is almost entirely sea. One current circles it, a wall of red stone splits it — everything worth finding lies along that band.'
      },
      worlds: [
        { name: 'op-blue', label: 'The Blue Planet', r: 6, offset: [380, 30, -260], spin: 0.045,
          shin: 40, spec: 0x336688,
          tex: (function () {
            // canonical layout: the Red Line circles pole-to-pole (two
            // meridians), the Grand Line crosses it at the equator, four
            // Blues in the quadrants, islands stamped along the Grand Line
            var ISLES = [[12, -58], [4, -18], [-6, 8], [1, 38], [-3, 62], [22, 88],
                         [-18, 105], [34, 132], [-38, 168]];
            return makeTex(TS, TS / 2, function (u, v) {
              var n = fbm(u * 8, v * 5, 51, 4);
              var col = ramp([[0.3, [10, 45, 95]], [0.55, [16, 80, 150]], [0.75, [30, 120, 190]]], n);
              if (n > 0.8) col = [225, 205, 150];
              var band = Math.abs(v - 0.5);
              if (band < 0.035) col = lerpC(col, [235, 245, 250], 0.55 * (1 - band / 0.035));
              var mer = Math.min(Math.abs(u - 0.22), Math.abs(u - 0.72));
              if (mer < 0.012) col = lerpC(col, [150, 45, 40], 0.8);
              for (var ii = 0; ii < ISLES.length; ii++) {
                var iu = (ISLES[ii][1] + 180) / 360, iv = (90 - ISLES[ii][0]) / 180;
                var du = Math.abs(u - iu); if (du > 0.5) du = 1 - du;
                if (du * du * 4 + (v - iv) * (v - iv) < 0.00028) col = [222, 200, 140];
              }
              return col;
            });
          })(),
          surfLabels: [['Dawn Island', 12, -58], ['Alabasta', 4, -18], ['Water 7', -6, 8],
                       ['Sabaody', 1, 38], ['Dressrosa', -3, 62], ['Wano', 22, 88],
                       ['Whole Cake', -18, 105], ['Elbaf', 34, 132]],
          custom: function (mesh, lp, gx) {
            // Skypiea — an island in the sky, riding the White-White Sea
            var sky = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.09, 18),
              new THREE.MeshPhongMaterial({ color: 0xf2ecdc }));
            sky.position.copy(latLon(6, 55, 6 * 1.32));
            sky.lookAt(0, 0, 0);
            sky.rotateX(Math.PI / 2);
            mesh.add(sky);
            var puff = glow([[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.25)'],
                             [1, 'rgba(0,0,0,0)']], 2.2, 0.6);
            puff.position.copy(latLon(6, 55, 6 * 1.26));
            mesh.add(puff);
            mkLabel(mesh, 'Skypiea — 10,000 m up', '#eef4ff', latLon(6, 55, 6 * 1.5), 0.3);
            // Fish-Man Island, deep beneath the Red Line
            mkLabel(mesh, 'Fish-Man Island — 10,000 m down', '#7db8e8', latLon(-6, 46, 6.15), 0.16);
            // and at the end of the Grand Line, barely marked...
            var lt = glow([[0, 'rgba(255,225,140,1)'], [0.5, 'rgba(255,190,60,0.4)'],
                           [1, 'rgba(0,0,0,0)']], 0.45, 0.85);
            lt.position.copy(latLon(-38, 168, 6.03));
            mesh.add(lt);
            mkLabel(mesh, 'Laugh Tale', '#ffe9a8', latLon(-38, 168, 6.35), 0.1);
          } }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-pokemon', name: 'Pokémon Galaxy', accent: '#ffd76a',
      starColors: warm, glow0: 'rgba(255,220,120,0.9)', glow1: 'rgba(255,120,120,0.25)',
      arrive: 'A fan tribute — a world where every wild creature might become a lifelong friend.',
      worlds: [
        { name: 'pk-kanto', label: 'Kanto', r: 4, tex: duoTex([20, 70, 120], [110, 190, 110], 7, 41) },
        { name: 'pk-johto', label: 'Johto', r: 3.6, tex: duoTex([30, 90, 100], [190, 200, 130], 8, 43) }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-bleach', name: 'Soul Society Galaxy', accent: '#cdd6ff',
      starColors: iceW, glow0: 'rgba(210,220,255,0.9)', glow1: 'rgba(120,130,220,0.25)',
      arrive: 'A fan tribute — a world for the living, and a quieter one beside it for everyone else.',
      worlds: [
        { name: 'bl-living', label: 'The Living World', r: 4, tex: duoTex([25, 45, 90], [120, 150, 170], 7, 47) },
        { name: 'bl-seireitei', label: 'Seireitei', r: 3.2, tex: duoTex([200, 200, 210], [245, 245, 250], 10, 53) }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-titan', name: 'Walled World Galaxy', accent: '#c9b892',
      starColors: ember, glow0: 'rgba(220,200,160,0.9)', glow1: 'rgba(150,110,70,0.25)',
      arrive: 'A fan tribute — an island that believed itself the whole world, ringed by three walls.',
      worlds: [
        { name: 'aot-paradis', label: 'Paradis', r: 4.2, tex: duoTex([50, 70, 50], [160, 150, 110], 6, 59) }
      ]
    });
    buildGalaxy({
      cat: 'anime', id: 'gx-gundam', name: 'Colony Galaxy', accent: '#9fc9ff',
      starColors: cool, glow0: 'rgba(180,210,255,0.9)', glow1: 'rgba(90,130,220,0.25)',
      arrive: 'A fan tribute — humanity moved into the sky and took its wars along.',
      worlds: [
        { name: 'gd-earth', label: 'Earth Sphere', r: 4, tex: duoTex([16, 40, 90], [90, 140, 110], 8, 61) },
        { name: 'gd-side3', label: 'Side 3', r: 2.2, ring: true, color: 0x8fa0b8 }
      ]
    });

    // ---- CARTOONS ----
    buildGalaxy({
      cat: 'cartoons', id: 'gx-rickmorty', name: 'C-137 Galaxy', accent: '#a8ff9d',
      starColors: [[0.7, 1, 0.7], [0.9, 1, 0.8], [0.7, 0.9, 1]],
      glow0: 'rgba(170,255,150,0.9)', glow1: 'rgba(60,200,120,0.25)',
      arrive: 'A fan tribute — one of infinite realities; this one has a garage and a portal gun.',
      worlds: [
        { name: 'rm-earth', label: 'Earth (C-137)', r: 4, tex: duoTex([16, 40, 90], [90, 150, 100], 8, 67) },
        { name: 'rm-gazorpazorp', label: 'Gazorpazorp', r: 3, tex: duoTex([140, 70, 40], [220, 150, 90], 7, 71) }
      ]
    });
    buildGalaxy({
      cat: 'cartoons', id: 'gx-ben10', name: 'Omnitrix Galaxy', accent: '#7dff9a',
      starColors: cool, glow0: 'rgba(120,255,160,0.9)', glow1: 'rgba(40,180,90,0.25)',
      arrive: 'A fan tribute — ten heroes in one wrist, and a galaxy that keeps needing all of them.',
      worlds: [
        { name: 'b10-galvan', label: 'Galvan Prime', r: 3, tex: duoTex([30, 60, 60], [140, 220, 180], 9, 73) },
        { name: 'b10-vulpin', label: 'Vulpin', r: 3.4, tex: duoTex([60, 45, 70], [150, 120, 170], 7, 79) }
      ]
    });
    buildGalaxy({
      cat: 'cartoons', id: 'gx-futurama', name: 'New New York Galaxy', accent: '#ffb0e0',
      starColors: warm, glow0: 'rgba(255,180,230,0.9)', glow1: 'rgba(200,80,180,0.25)',
      arrive: 'A fan tribute — the year 3000, delivery guaranteed anywhere in the universe.',
      worlds: [
        { name: 'fu-earth', label: 'Earth (3000)', r: 4, tex: duoTex([16, 40, 90], [110, 140, 130], 8, 83) },
        { name: 'fu-omicron', label: 'Omicron Persei 8', r: 3.6, tex: duoTex([60, 80, 40], [140, 180, 80], 6, 89) }
      ]
    });
    buildGalaxy({
      cat: 'cartoons', id: 'gx-adventure', name: 'Land of Ooo Galaxy', accent: '#ffd9f0',
      starColors: [[1, 0.85, 0.95], [0.85, 0.95, 1], [1, 1, 0.8]],
      glow0: 'rgba(255,210,240,0.9)', glow1: 'rgba(180,120,220,0.25)',
      arrive: 'A fan tribute — a candy-bright world grown over something much older.',
      worlds: [
        { name: 'at-ooo', label: 'Ooo', r: 4, tex: duoTex([90, 160, 130], [250, 200, 220], 7, 97) }
      ]
    });

    // ---- SCI-FI CINEMA ----
    buildGalaxy({
      cat: 'movies', id: 'gx-starwars', name: 'A Galaxy Far, Far Away', accent: '#ffe081',
      starColors: warm, glow0: 'rgba(255,225,140,0.9)', glow1: 'rgba(220,160,60,0.25)',
      arrive: 'A fan tribute — it happened a long time ago, and very far from here.',
      facts: {
        'sw-tatooine': 'Twin suns, one farm boy. Deserts here have a way of starting things.',
        'sw-hoth': 'An ice world nobody would choose — which is exactly why they chose it.'
      },
      worlds: [
        { name: 'sw-tatooine', label: 'Tatooine', r: 3.8, tex: duoTex([150, 110, 60], [230, 195, 130], 6, 101) },
        { name: 'sw-hoth', label: 'Hoth', r: 3.4, tex: duoTex([180, 195, 215], [245, 250, 255], 8, 103) },
        { name: 'sw-coruscant', label: 'Coruscant', r: 4.2, tex: duoTex([40, 45, 60], [180, 170, 130], 12, 107) }
      ]
    });
    buildGalaxy({
      cat: 'movies', id: 'gx-startrek', name: 'Federation Galaxy', accent: '#9fd0ff',
      starColors: cool, glow0: 'rgba(170,210,255,0.9)', glow1: 'rgba(80,120,220,0.25)',
      arrive: 'A fan tribute — space: still the final frontier.',
      worlds: [
        { name: 'st-vulcan', label: 'Vulcan', r: 3.8, tex: duoTex([120, 55, 30], [210, 130, 70], 6, 109) },
        { name: 'st-qonos', label: "Qo'noS", r: 4, tex: duoTex([50, 30, 30], [140, 80, 60], 7, 113) }
      ]
    });
    buildGalaxy({
      cat: 'movies', id: 'gx-dune', name: 'Imperium Galaxy', accent: '#ffcf9a',
      starColors: warm, glow0: 'rgba(255,205,150,0.9)', glow1: 'rgba(200,120,50,0.25)',
      arrive: 'A fan tribute — he who controls one desert planet controls everything.',
      facts: { 'dn-arrakis': 'Arrakis — the spice is here, and the worms are under it. Walk without rhythm.' },
      worlds: [
        { name: 'dn-arrakis', label: 'Arrakis', r: 4, tex: duoTex([140, 100, 55], [235, 200, 140], 5, 127) },
        { name: 'dn-caladan', label: 'Caladan', r: 3.6, tex: duoTex([15, 55, 100], [80, 140, 170], 8, 131) }
      ]
    });
    buildGalaxy({
      cat: 'movies', id: 'gx-avatar', name: 'Alpha Centauri Tribute', accent: '#7dfce8',
      starColors: cool, glow0: 'rgba(130,250,230,0.9)', glow1: 'rgba(50,160,200,0.25)',
      arrive: 'A fan tribute — a moon that glows at night and remembers everything.',
      facts: {
        'av-pandora': 'Pandora — mountains that ignore gravity, forests that glow in the dark, and a network older than every nation that ever visited it.'
      },
      worlds: [
        { name: 'av-pandora', label: 'Pandora', r: 4, spin: 0.05,
          tex: worldTexPro([20, 90, 60], [110, 230, 170], 137, { sea: [14, 70, 110] }),
          surfLabels: [['Omatikaya Forest', -4, -20], ['The Eastern Sea', 5, 95]],
          custom: function (mesh, lp, gx) {
            // the Hallelujah Mountains — rock islands hanging in the sky
            for (var i = 0; i < 7; i++) {
              var rock = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.16 + hash(i, 1, 7) * 0.22, 0),
                new THREE.MeshPhongMaterial({ color: 0x5a6f66, flatShading: true }));
              rock.position.copy(latLon(8 + (hash(i, 2, 7) - 0.5) * 14,
                -40 + (hash(i, 3, 7) - 0.5) * 18, 4 * (1.12 + hash(i, 4, 7) * 0.16)));
              mesh.add(rock);
            }
            mkLabel(mesh, 'Hallelujah Mountains', '#9df2dd', latLon(8, -40, 5.6), 0.26);
            // the Tree of Souls, pale and awake
            var soul = glow([[0, 'rgba(215,255,246,1)'], [0.4, 'rgba(120,240,220,0.5)'],
                             [1, 'rgba(0,0,0,0)']], 0.7, 0.9);
            soul.position.copy(latLon(-12, -55, 4.05));
            mesh.add(soul);
            mkLabel(mesh, 'Tree of Souls', '#c9fff2', latLon(-12, -55, 4.5), 0.18);
            // ikran circling the floating peaks
            var BN = 12, bAng = [];
            var bp3 = new Float32Array(BN * 3);
            var bGeo = new THREE.BufferGeometry();
            bGeo.setAttribute('position', new THREE.BufferAttribute(bp3, 3));
            var flock = new THREE.Points(bGeo, new THREE.PointsMaterial({
              color: 0xbafff0, size: 2, sizeAttenuation: false,
              transparent: true, opacity: 0.9, depthWrite: false }));
            flock.frustumCulled = false;
            mesh.add(flock);
            for (var b3 = 0; b3 < BN; b3++) bAng.push(hash(b3, 5, 7) * 6.28);
            gx.customs.push(function (w) {
              for (var k = 0; k < BN; k++) {
                bAng[k] += w * (0.35 + hash(k, 6, 7) * 0.5);
                var bd = latLon(8 + Math.sin(bAng[k]) * 9,
                                -40 + Math.cos(bAng[k] * 0.8) * 13,
                                4 * (1.1 + 0.05 * Math.sin(bAng[k] * 2 + k)));
                bp3[k * 3] = bd.x; bp3[k * 3 + 1] = bd.y; bp3[k * 3 + 2] = bd.z;
              }
              bGeo.attributes.position.needsUpdate = true;
            });
          } },
        { name: 'av-polyphemus', label: 'Polyphemus', r: 9, tex: duoTex([40, 70, 140], [120, 160, 220], 4, 139) }
      ]
    });
    buildGalaxy({
      cat: 'movies', id: 'gx-interstellar', name: 'Gargantua Tribute', accent: '#d8c9a8',
      starColors: iceW, glow0: 'rgba(230,215,180,0.9)', glow1: 'rgba(160,130,90,0.25)',
      arrive: 'A fan tribute — where an hour can cost you seven years, and love is the only constant.',
      worlds: [
        { name: 'in-miller', label: "Miller's World", r: 3.6, shin: 60, spec: 0x557799,
          tex: duoTex([30, 80, 120], [110, 170, 200], 3, 149) },
        { name: 'in-mann', label: "Mann's World", r: 3.4, tex: duoTex([170, 185, 205], [240, 245, 252], 9, 151) }
      ]
    });
    buildGalaxy({
      cat: 'movies', id: 'gx-matrix', name: 'Simulation Galaxy', accent: '#8dff9d',
      starColors: [[0.6, 1, 0.6], [0.8, 1, 0.8], [0.9, 1, 0.9]],
      glow0: 'rgba(130,255,150,0.9)', glow1: 'rgba(30,160,60,0.25)',
      arrive: 'A fan tribute — there is no spoon, and possibly no galaxy either.',
      worlds: [
        { name: 'mx-machine', label: 'The Machine World', r: 4, tex: duoTex([10, 30, 15], [60, 180, 90], 12, 157) }
      ]
    });

    // ---- GAMES ----
    buildGalaxy({
      cat: 'games', id: 'gx-halo', name: 'Installation Galaxy', accent: '#9fd8c9',
      starColors: cool, glow0: 'rgba(170,225,210,0.9)', glow1: 'rgba(70,150,140,0.25)',
      arrive: 'A fan tribute — ancient rings hang in the dark here, and they are not decorations.',
      facts: { 'hl-ring': 'Installation 04 — a ring ten thousand kilometres across. Its purpose is not peaceful.' },
      worlds: [
        { name: 'hl-reach', label: 'Reach', r: 4, tex: duoTex([60, 65, 75], [150, 150, 140], 7, 163) },
        { name: 'hl-ring', label: 'Installation 04', r: 5, ring: true, color: 0x9aa89a }
      ]
    });
    buildGalaxy({
      cat: 'games', id: 'gx-masseffect', name: 'Citadel Galaxy', accent: '#a8c0ff',
      starColors: cool, glow0: 'rgba(180,200,255,0.9)', glow1: 'rgba(90,110,220,0.25)',
      arrive: 'A fan tribute — the relays are quiet tonight. Enjoy the calm while it lasts.',
      worlds: [
        { name: 'me-thessia', label: 'Thessia', r: 3.8, tex: duoTex([30, 60, 120], [130, 170, 230], 7, 167) },
        { name: 'me-tuchanka', label: 'Tuchanka', r: 4, tex: duoTex([90, 70, 45], [180, 150, 100], 6, 173) }
      ]
    });
    buildGalaxy({
      cat: 'games', id: 'gx-nms', name: 'Atlas Galaxy', accent: '#ffb8d8',
      starColors: [[1, 0.7, 0.85], [0.8, 0.9, 1], [1, 0.95, 0.7]],
      glow0: 'rgba(255,180,220,0.9)', glow1: 'rgba(180,80,160,0.25)',
      arrive: 'A fan tribute — eighteen quintillion worlds, and you happened to land on this one.',
      worlds: [
        { name: 'nms-1', label: 'An Uncharted World', r: 3.6, tex: duoTex([160, 60, 120], [255, 180, 120], 8, 179) },
        { name: 'nms-2', label: 'Another Uncharted World', r: 3.2, tex: duoTex([40, 140, 130], [230, 240, 130], 9, 181) }
      ]
    });
    buildGalaxy({
      cat: 'games', id: 'gx-metroid', name: 'Chozo Galaxy', accent: '#d0a8ff',
      starColors: [[0.8, 0.7, 1], [0.9, 0.85, 1], [0.7, 0.9, 1]],
      glow0: 'rgba(200,170,255,0.9)', glow1: 'rgba(120,70,200,0.25)',
      arrive: 'A fan tribute — the bounty hunter has been here already. It is quieter now.',
      worlds: [
        { name: 'mt-zebes', label: 'Zebes', r: 3.8, tex: duoTex([60, 40, 70], [140, 100, 130], 7, 191) }
      ]
    });

    // ---- FANTASY ----
    buildGalaxy({
      cat: 'fantasy', id: 'gx-middleearth', name: 'Arda Galaxy', accent: '#c9e8a8',
      starColors: warm, glow0: 'rgba(210,235,180,0.9)', glow1: 'rgba(120,170,80,0.25)',
      arrive: 'A fan tribute — one world to rule them all, and in the starlight bind them.',
      facts: { 'me-arda': 'Arda — its history is written in three ages of song, and one very troublesome ring.' },
      worlds: [
        { name: 'me-arda', label: 'Arda', r: 4.4, spin: 0.05,
          tex: duoTex([25, 65, 55], [140, 170, 110], 6, 193),
          surfLabels: [['The Shire', 30, -20], ['Mordor', 12, 35], ['Gondor', 5, 12],
                       ['Rivendell', 38, -4], ['Rohan', 14, 4], ['Erebor', 48, 16]] }
      ]
    });
    buildGalaxy({
      cat: 'fantasy', id: 'gx-narnia', name: 'Wardrobe Galaxy', accent: '#d8ecff',
      starColors: iceW, glow0: 'rgba(225,240,255,0.9)', glow1: 'rgba(140,180,230,0.25)',
      arrive: 'A fan tribute — always winter somewhere, but never without a thaw coming.',
      worlds: [
        { name: 'na-narnia', label: 'Narnia', r: 3.8, tex: duoTex([170, 190, 210], [110, 170, 110], 7, 197) }
      ]
    });
    buildGalaxy({
      cat: 'fantasy', id: 'gx-witcher', name: 'Continent Galaxy', accent: '#c9c0a8',
      starColors: ember, glow0: 'rgba(215,205,175,0.9)', glow1: 'rgba(130,110,80,0.25)',
      arrive: 'A fan tribute — toss a coin to whoever keeps this galaxy safe.',
      worlds: [
        { name: 'wi-continent', label: 'The Continent', r: 4, tex: duoTex([45, 55, 45], [150, 140, 105], 6, 199) }
      ]
    });
    buildGalaxy({
      cat: 'fantasy', id: 'gx-warcraft', name: 'Azeroth Galaxy', accent: '#8fd8ff',
      starColors: cool, glow0: 'rgba(160,220,255,0.9)', glow1: 'rgba(60,140,220,0.25)',
      arrive: 'A fan tribute — a world split by war and stitched together by heroes.',
      worlds: [
        { name: 'wc-azeroth', label: 'Azeroth', r: 4.2, tex: duoTex([20, 80, 120], [120, 200, 130], 7, 211) },
        { name: 'wc-draenor', label: 'Draenor', r: 3.6, tex: duoTex([120, 50, 40], [200, 130, 80], 6, 223) }
      ]
    });

    // ---- MYTHOLOGY ----
    buildGalaxy({
      cat: 'myth', id: 'gx-greek', name: 'Olympian Galaxy', accent: '#ffe8b8',
      starColors: warm, glow0: 'rgba(255,235,190,0.9)', glow1: 'rgba(220,180,100,0.25)',
      arrive: 'Greek mythology — the gods kept a mountain; the myths kept everything else.',
      facts: { 'gr-olympus': 'Olympus — cloud-white marble above every storm. The gods argued here for a thousand years of stories.' },
      worlds: [
        { name: 'gr-olympus', label: 'Olympus', r: 3.6, ico: true, color: 0xf2ead8 },
        { name: 'gr-underworld', label: 'The Underworld', r: 3.8, tex: duoTex([25, 20, 35], [90, 70, 110], 8, 227) }
      ]
    });
    buildGalaxy({
      cat: 'myth', id: 'gx-norse', name: 'Yggdrasil Galaxy', accent: '#b8d8ff',
      starColors: iceW, glow0: 'rgba(200,225,255,0.9)', glow1: 'rgba(110,150,220,0.25)',
      arrive: 'Norse mythology — nine worlds on one tree, and a wolf waiting at the end of it.',
      worlds: [
        { name: 'no-asgard', label: 'Asgard', r: 3.4, ico: true, color: 0xe8d8a8 },
        { name: 'no-midgard', label: 'Midgard', r: 4, tex: duoTex([20, 60, 100], [110, 160, 120], 7, 229) },
        { name: 'no-jotunheim', label: 'Jötunheim', r: 3.6, tex: duoTex([160, 180, 205], [235, 245, 255], 8, 233) }
      ]
    });
    buildGalaxy({
      cat: 'myth', id: 'gx-egypt', name: 'Duat Galaxy', accent: '#ffd88f',
      starColors: warm, glow0: 'rgba(255,215,145,0.9)', glow1: 'rgba(200,140,60,0.25)',
      arrive: 'Egyptian mythology — the sun sails a boat, and the night is a river with judges.',
      worlds: [
        { name: 'eg-duat', label: 'The Duat', r: 3.8, tex: duoTex([40, 30, 25], [180, 140, 70], 7, 239) },
        { name: 'eg-reeds', label: 'Field of Reeds', r: 3.4, tex: duoTex([70, 110, 50], [200, 210, 120], 6, 241) }
      ]
    });
    buildGalaxy({
      cat: 'myth', id: 'gx-hindu', name: 'Meru Galaxy', accent: '#ffc9a8',
      starColors: warm, glow0: 'rgba(255,205,170,0.9)', glow1: 'rgba(230,130,80,0.25)',
      arrive: 'Hindu cosmology — a golden mountain at the axis of everything, and oceans of story around it.',
      facts: { 'hi-meru': 'Mount Meru — in the old cosmologies, the centre pole of the universe, golden and impossibly tall.' },
      worlds: [
        { name: 'hi-meru', label: 'Mount Meru', r: 3.8, ico: true, color: 0xf0cf8f },
        { name: 'hi-vaikuntha', label: 'Vaikuntha', r: 3.4, tex: duoTex([30, 60, 130], [170, 190, 240], 7, 251) }
      ]
    });

    // ---- ORIGINAL UNIVERSES ----
    buildGalaxy({
      cat: 'original', id: 'gx-crystal', name: 'Crystal Galaxy', accent: '#b8ecff',
      detailed: true, cloudR: 1.9e4, starColors: iceW, starR: 40, starColor: 0xeaf6ff,
      starLabel: 'The Prism Star', glow0: 'rgba(230,250,255,0.9)', glow1: 'rgba(150,200,255,0.3)',
      nebulae: [['rgba(140,230,255,0.13)', 'rgba(60,120,200,0.04)', 0.5]],
      arrive: 'The Crystal galaxy — an original universe. Matter froze mid-thought, and light learned to live in glass.',
      facts: {
        'cry-1': 'A world with no soil — only faces and edges. Rain here falls as slow glass.',
        'cry-3': 'The shard ring is what remains of a twin world that crystallised too fast and shattered.'
      },
      worlds: [
        { name: 'cry-1', label: 'Facet', r: 3.5, offset: [320, 20, 90], ico: true, color: 0x9fd8e8, spin: 0.12 },
        { name: 'cry-2', label: 'Amethyst', r: 2.8, offset: [-460, -40, 300], ico: true, color: 0xb99fe8, spin: 0.09 },
        { name: 'cry-3', label: 'The Shattered Twin', r: 4.2, offset: [620, 60, -420], ico: true, color: 0xe8c2d8, shardRing: true }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-ocean', name: 'Thalassa Galaxy', accent: '#7dc9ff',
      starColors: cool, glow0: 'rgba(140,205,255,0.9)', glow1: 'rgba(40,110,200,0.25)',
      arrive: 'An original universe — every world here drowned young, and none of them mind.',
      worlds: [
        { name: 'oc-1', label: 'Thalassa', r: 4.2, shin: 70, spec: 0x5588aa, tex: duoTex([8, 40, 90], [40, 120, 180], 5, 257) },
        { name: 'oc-2', label: 'The Shallows', r: 3, shin: 70, spec: 0x66aabb, tex: duoTex([20, 90, 120], [130, 220, 220], 6, 263) }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-neon', name: 'Neon Galaxy', accent: '#ff7dff',
      starColors: [[1, 0.5, 1], [0.5, 1, 1], [1, 1, 0.6]],
      glow0: 'rgba(255,130,255,0.9)', glow1: 'rgba(80,220,255,0.3)',
      arrive: 'An original universe — night never falls here, because nobody ever turns the signs off.',
      worlds: [
        { name: 'ne-1', label: 'Signville', r: 3.4, ico: true, color: 0xff6ee8, spin: 0.15 },
        { name: 'ne-2', label: 'Afterglow', r: 2.8, ico: true, color: 0x6ee8ff, spin: 0.11 }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-clockwork', name: 'Clockwork Galaxy', accent: '#e8c9a0',
      starColors: warm, glow0: 'rgba(235,205,160,0.9)', glow1: 'rgba(180,130,70,0.25)',
      arrive: 'An original universe — everything here keeps perfect time except its inhabitants.',
      worlds: [
        { name: 'cw-1', label: 'The Mainspring', r: 3.6, tex: duoTex([90, 70, 40], [200, 170, 110], 10, 269) },
        { name: 'cw-2', label: 'The Escapement', r: 4.6, ring: true, color: 0xc9a86a }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-shadow', name: 'Shadow Galaxy', accent: '#9a8fc9',
      starColors: [[0.5, 0.45, 0.7], [0.6, 0.55, 0.8], [0.4, 0.4, 0.6]],
      glow0: 'rgba(120,105,180,0.7)', glow1: 'rgba(50,40,90,0.25)',
      arrive: 'An original universe — the stars here are shy. Look slightly away and they brighten.',
      worlds: [
        { name: 'sh-1', label: 'Umbra', r: 3.8, tex: duoTex([15, 12, 25], [70, 60, 110], 7, 271) }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-quantum', name: 'Quantum Galaxy', accent: '#9dffd8',
      starColors: cool, glow0: 'rgba(160,255,220,0.9)', glow1: 'rgba(60,200,160,0.25)',
      arrive: 'An original universe — nothing here is anywhere until you look at it. You are now looking.',
      worlds: [
        { name: 'qu-1', label: 'Maybe', r: 1.2, ico: true, color: 0x9dffd8, spin: 0.5 },
        { name: 'qu-2', label: 'Perhaps', r: 1.2, ico: true, color: 0x8fd8ff, spin: -0.5 }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-musical', name: 'Musical Galaxy', accent: '#ffd0a0',
      starColors: warm, glow0: 'rgba(255,215,170,0.9)', glow1: 'rgba(220,140,90,0.25)',
      arrive: 'An original universe — its worlds orbit in 3/4 time. The silence between them is the music.',
      worlds: [
        { name: 'mu-1', label: 'Crescendo', r: 3.4, ico: true, color: 0xf2c9a0, spin: 0.13 },
        { name: 'mu-2', label: 'Adagio', r: 2.6, ico: true, color: 0xc9a0f2, spin: 0.04 },
        { name: 'mu-3', label: 'The Staff', r: 4.4, ring: true, color: 0xd8c9b0 }
      ]
    });
    buildGalaxy({
      cat: 'original', id: 'gx-fractal', name: 'Fractal Galaxy', accent: '#c9ff9d',
      starColors: cool, glow0: 'rgba(200,255,160,0.9)', glow1: 'rgba(100,200,80,0.25)',
      arrive: 'An original universe — zoom in on any world here and you will find it again, smaller.',
      worlds: [
        { name: 'fr-1', label: 'Self-Similar', r: 4, ico: true, color: 0xa8e88f, spin: 0.08 },
        { name: 'fr-2', label: 'Self-Similar (smaller)', r: 1.3, ico: true, color: 0xa8e88f, spin: 0.08 }
      ]
    });

    /* ------------- scientific destinations: witness, don't read ------------ */
    function addScienceSites() {
      buildGalaxy({
        cat: 'science', id: 'sx-nursery', name: 'A Stellar Nursery', accent: '#ffc9d8',
        cloudR: 1.5e4, starColors: [[1, 0.8, 0.85], [0.9, 0.85, 1], [1, 0.95, 0.8]],
        starR: 18, starColor: 0xfff0e0, starLabel: 'A Newborn Star',
        glow0: 'rgba(255,190,215,0.9)', glow1: 'rgba(200,90,150,0.3)',
        nebulae: [['rgba(255,140,190,0.2)', 'rgba(150,50,120,0.06)', 0.55],
                  ['rgba(140,180,255,0.14)', 'rgba(60,80,200,0.05)', 0.5]],
        arrive: 'A stellar nursery — you are watching stars being born. Every bright knot in this cloud is a sun younger than your species.',
        worlds: []
      });
      var nursery = galaxies[galaxies.length - 1];
      nursery.babies = [];
      for (var nb = 0; nb < 12; nb++) {
        var bs = glow([[0, 'rgba(255,250,240,1)'], [0.4, 'rgba(255,200,170,0.4)'],
                       [1, 'rgba(0,0,0,0)']], 260 + hash(nb, 1, 11) * 500, 0.85);
        bs.position.set((hash(nb, 2, 11) - 0.5) * nursery.R * 1.2,
                        (hash(nb, 3, 11) - 0.5) * nursery.R * 0.3,
                        (hash(nb, 4, 11) - 0.5) * nursery.R * 1.2);
        nursery.group.add(bs);
        nursery.babies.push([bs, 1.5 + hash(nb, 5, 11) * 3, bs.material.opacity]);
      }
      nursery.customs.push(function (w, t) {
        for (var i = 0; i < nursery.babies.length; i++) {
          var b = nursery.babies[i];
          b[0].material.opacity = b[2] * (0.72 + 0.28 * Math.sin(t * b[1] + i * 2.1));
        }
      });

      buildGalaxy({
        cat: 'science', id: 'sx-remnant', name: 'A Supernova Remnant', accent: '#9fd8ff',
        cloudR: 1.3e4, starColors: [[0.75, 0.9, 1], [0.9, 0.95, 1], [1, 1, 1]],
        starR: 6, starColor: 0xeaf6ff, starLabel: 'The Neutron Star',
        glow0: 'rgba(200,235,255,0.9)', glow1: 'rgba(90,160,255,0.3)',
        nebulae: [['rgba(120,200,255,0.16)', 'rgba(50,90,200,0.05)', 0.5]],
        arrive: 'A supernova remnant — the corpse of a star that ended ten thousand years ago. Its shell is still expanding. You are inside the explosion.',
        worlds: []
      });
      var rem = galaxies[galaxies.length - 1];
      var SN = Math.floor(700 * ctx.quality.particleScale) + 120;
      var sd = new Float32Array(SN * 3), sr = new Float32Array(SN), sp2 = new Float32Array(SN * 3);
      for (var si = 0; si < SN; si++) {
        var u2 = Math.random() * 2 - 1, t2 = Math.random() * Math.PI * 2;
        var q = Math.sqrt(1 - u2 * u2);
        sd[si * 3] = q * Math.cos(t2); sd[si * 3 + 1] = u2; sd[si * 3 + 2] = q * Math.sin(t2);
        sr[si] = rem.R * (0.15 + Math.random() * 0.9);
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp2, 3));
      var shell = new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0xbfe0ff, size: 1.8, sizeAttenuation: false,
        transparent: true, opacity: 0.85, depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      shell.frustumCulled = false;
      rem.group.add(shell);
      rem.customs.push(function (w) {
        for (var i = 0; i < SN; i++) {
          sr[i] += w * rem.R * 0.02;
          if (sr[i] > rem.R * 1.1) sr[i] = rem.R * 0.15;
          sp2[i * 3] = sd[i * 3] * sr[i];
          sp2[i * 3 + 1] = sd[i * 3 + 1] * sr[i] * 0.8;
          sp2[i * 3 + 2] = sd[i * 3 + 2] * sr[i];
        }
        sg.attributes.position.needsUpdate = true;
      });
    }

    addScienceSites();

    /* ----------- procedural star systems: a galaxy is a PLACE -------------- */
    // Generated lazily on first approach, so 38 galaxies cost nothing until
    // someone actually goes exploring. Each system: star, themed + variety
    // planets, moons, belts, the odd pulsar, and rare hidden ruins.
    var GREEK = ['Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
    var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    var FACT_POOL = [
      'Tidally locked — one face in permanent noon, the other in permanent memory.',
      'Its year is shorter than its day. Time here is a matter of opinion.',
      'Auroras crown both poles, even at noon.',
      'The atmosphere rains diamonds at depth — probably. Nobody has gone to check.',
      'A failed star: slightly larger, and this system would have had two suns.',
      'Volcanically restless — its surface is younger than its clouds.',
      'An ocean under the ice, and in it, maybe, chemistry doing something ambitious.',
      'Storms here have names, and the names have outlived their namers.',
      'Its magnetic field sings in radio. Some say it is just physics. Some say.',
      'Nothing remarkable — which, out here, is the most remarkable thing of all.'
    ];
    function hex2rgb(hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function themedPair(accent, h1, h2) {
      var c = hex2rgb(accent);
      var dark = [c[0] * (0.12 + 0.18 * h1), c[1] * (0.12 + 0.18 * h1), c[2] * (0.14 + 0.2 * h1)];
      var lite = lerpC(c, [255, 255, 255], 0.25 + 0.35 * h2);
      return [dark, lite];
    }
    function buildSystems(gx) {
      var idx = gx.idx, g = gx.group, R = gx.R;
      var short = gx.name.replace(' Galaxy', '').replace('A Galaxy Far, Far Away', 'Outer Rim');
      var nSys = 2 + Math.floor(hash(idx, 21, 101) * 4);        // 2–5 extra systems
      for (var s = 0; s < nSys; s++) {
        var hs = function (k) { return hash(idx * 7 + s * 131, k, 107); };
        var ang = hs(1) * Math.PI * 2;
        var srad = R * (0.16 + 0.5 * hs(2));
        var sysPos = new THREE.Vector3(Math.cos(ang) * srad, (hs(3) - 0.5) * R * 0.12,
                                       Math.sin(ang) * srad);
        var sysName = short + ' ' + GREEK[s];
        var sysId = gx.id + '-s' + s;

        // the system's star (lit by the galaxy core light — no extra lights)
        var starR = 16 + 34 * hs(4);
        var scol = [0xfff0d0, 0xcfe0ff, 0xffc9a0, 0xf8f8ff][Math.floor(hs(5) * 4)];
        var star = new THREE.Mesh(new THREE.SphereGeometry(starR, 28, 18),
                                  new THREE.MeshBasicMaterial({ color: scol }));
        star.position.copy(sysPos);
        g.add(star);
        var halo = glow([[0, 'rgba(255,245,225,0.9)'], [0.5, 'rgba(255,200,130,0.25)'],
                         [1, 'rgba(0,0,0,0)']], starR * 6, 0.8);
        halo.position.copy(sysPos);
        g.add(halo);
        mkLabel(g, sysName, gx.accent, sysPos.clone().add(new THREE.Vector3(0, starR * 2.2, 0)), starR * 0.5);
        var sysAbs = gx.C.clone().add(sysPos);
        ctx.registerFocus({ name: sysId, label: sysName, radius: starR,
          minAlt: starR * 0.5, parent: gx.id,
          getPosition: (function (p) { return function () { return p; }; })(sysAbs) });
        ctx.addFact(sysId, sysName + ' — one of the star systems of ' + gx.name +
          '. ' + (hs(6) < 0.5 ? 'Its light will not reach your home for a very long time.'
                              : 'No probe from your world has ever been here.'));

        // planets: themed base + variety pool (ocean / lava / ice / rare ruins)
        var nP = 2 + Math.floor(hs(7) * 4);
        for (var p = 0; p < nP; p++) {
          var hp = function (k) { return hash(idx * 13 + s * 173 + p * 311, k, 109); };
          var pr = 1.4 + 4.6 * hp(1);
          var pd = starR * 2.5 + 130 + 190 * p + 90 * hp(2);
          var pa = hp(3) * Math.PI * 2;
          var pPos = sysPos.clone().add(new THREE.Vector3(Math.cos(pa) * pd,
            (hp(4) - 0.5) * 40, Math.sin(pa) * pd));
          var roll = hp(5);
          var mesh, fact;
          var seedP = idx * 100 + s * 10 + p;
          var atmCol = null, hasClouds = false;
          if (roll < 0.05) {                                        // hidden ruins
            mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 1),
              new THREE.MeshPhongMaterial({ color: 0x8a7448, flatShading: true, shininess: 60 }));
            fact = 'Ancient ruins cover this world pole to pole. Whoever built them measured time in eras, not years.';
          } else if (roll < 0.2) {                                   // ocean world
            mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 28, 18),
              new THREE.MeshPhongMaterial({
                map: worldTexPro([40, 110, 70], [200, 190, 150], seedP, { sea: [16, 80, 150] }),
                shininess: 70, specular: new THREE.Color(0x5588aa) }));
            fact = 'An unbroken ocean. Its tides answer ' + (nP > 2 ? 'two' : 'one') + ' moons and no one else.';
            atmCol = 'rgba(125,185,255,0.55)';
            hasClouds = true;
          } else if (roll < 0.32) {                                  // lava world
            mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 28, 18),
              new THREE.MeshPhongMaterial({
                map: worldTexPro([30, 8, 5], [255, 130, 40], seedP, { cap: false }),
                emissive: new THREE.Color(0x551a00), shininess: 10 }));
            fact = 'Molten from crust to core — a planet still deciding what it wants to be.';
            atmCol = 'rgba(255,150,80,0.45)';
          } else if (roll < 0.44) {                                  // ice world
            mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 28, 18),
              new THREE.MeshPhongMaterial({
                map: worldTexPro([150, 175, 200], [245, 250, 255], seedP),
                shininess: 55, specular: new THREE.Color(0x8899bb) }));
            fact = 'Frozen so long that its glaciers have geology of their own.';
            atmCol = 'rgba(200,228,255,0.4)';
          } else {                                                   // themed world
            var pair = themedPair(gx.accent, hp(6), hp(7));
            var seaC = hp(13) < 0.55
              ? lerpC(hex2rgb(gx.accent), [18, 55, 125], 0.65) : null;
            mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 28, 18),
              new THREE.MeshPhongMaterial({
                map: worldTexPro(pair[0], pair[1], seedP, { sea: seaC }),
                shininess: seaC ? 45 : 12,
                specular: new THREE.Color(seaC ? 0x446688 : 0x222222) }));
            fact = FACT_POOL[Math.floor(hp(9) * FACT_POOL.length)];
            var ac = hex2rgb(gx.accent);
            atmCol = 'rgba(' + (ac[0] | 0) + ',' + (ac[1] | 0) + ',' + (ac[2] | 0) + ',0.45)';
            hasClouds = hp(14) < 0.55;
          }
          mesh.position.copy(pPos);
          g.add(mesh);

          // every world wears its air: a soft rim of atmosphere
          if (atmCol) {
            var atm = glow([[0, 'rgba(0,0,0,0)'], [0.58, 'rgba(0,0,0,0)'],
                            [0.78, atmCol], [1, 'rgba(0,0,0,0)']], pr * 2.9, 0.55);
            atm.position.copy(pPos);
            g.add(atm);
          }
          // independent, drifting cloud decks
          if (hasClouds) {
            var cl = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.035, 22, 14),
              new THREE.MeshLambertMaterial({ map: cloudTex(seedP + 5),
                transparent: true, depthWrite: false, opacity: 0.85 }));
            cl.position.copy(pPos);
            g.add(cl);
            gx.spinners.push([cl, 0.09 + hp(15) * 0.12]);
          }
          // a few worlds keep rings
          if (hp(16) < 0.14) {
            var rgeo = new THREE.RingGeometry(pr * 1.55, pr * 2.4, 48);
            var rmesh = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({
              color: (hp(17) < 0.5 ? 0xcbbfa8 : 0xa8bfd0), transparent: true,
              opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
            rmesh.rotation.x = 1.1 + (hp(18) - 0.5) * 0.8;
            rmesh.position.copy(pPos);
            g.add(rmesh);
          }
          var pName = sysName + ' ' + ROMAN[p];
          var pId = sysId + '-p' + p;
          mkLabel(g, pName, '#aab8d0', pPos.clone().add(new THREE.Vector3(0, pr * 1.9, 0)), pr * 0.42);
          var pAbs = gx.C.clone().add(pPos);
          ctx.registerFocus({ name: pId, label: pName, radius: pr, parent: sysId,
            getPosition: (function (q) { return function () { return q; }; })(pAbs) });
          ctx.addFact(pId, fact);
          gx.spinners.push([mesh, 0.04 + hp(10) * 0.1]);

          // moons for the lucky ones
          if (hp(11) < 0.35) {
            var mr = pr * (0.18 + 0.15 * hp(12));
            var moon = new THREE.Mesh(new THREE.SphereGeometry(mr, 16, 10),
              new THREE.MeshLambertMaterial({ color: 0x9a948c }));
            moon.position.copy(pPos).add(new THREE.Vector3(pr * 3, pr * 0.4, pr * 1.5));
            g.add(moon);
          }
        }

        // some systems keep an asteroid belt
        if (hs(8) < 0.3) {
          var bn = Math.floor(500 * ctx.quality.particleScale) + 80;
          var bpos = new Float32Array(bn * 3);
          var br = starR * 2.5 + 130 + 190 * nP;
          for (var b2 = 0; b2 < bn; b2++) {
            var ba = Math.random() * Math.PI * 2;
            var brr = br * (0.92 + Math.random() * 0.18);
            bpos[b2 * 3] = sysPos.x + Math.cos(ba) * brr;
            bpos[b2 * 3 + 1] = sysPos.y + (Math.random() - 0.5) * 26;
            bpos[b2 * 3 + 2] = sysPos.z + Math.sin(ba) * brr;
          }
          var bgeo = new THREE.BufferGeometry();
          bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
          var bp2 = new THREE.Points(bgeo, new THREE.PointsMaterial({
            color: 0x8d8272, size: 1.3, sizeAttenuation: false,
            transparent: true, opacity: 0.6, depthWrite: false }));
          bp2.frustumCulled = false;
          g.add(bp2);
        }

        // and a few hide a pulsar
        if (hs(9) < 0.12) {
          var pu = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1),
            new THREE.MeshBasicMaterial({ color: 0xeaf4ff }));
          pu.position.copy(sysPos).add(new THREE.Vector3(starR * 5, 20, -starR * 3));
          g.add(pu);
          var pg = glow([[0, 'rgba(230,245,255,1)'], [0.4, 'rgba(150,200,255,0.4)'],
                         [1, 'rgba(0,0,0,0)']], 14, 0.9);
          pg.position.copy(pu.position);
          g.add(pg);
          mkLabel(g, 'Pulsar', '#cfe6ff', pu.position.clone().add(new THREE.Vector3(0, 5, 0)), 1.6);
          gx.spinners.push([pu, 4.0]);
        }
      }
    }

    /* ------------- black hole infall — matter spiraling in ----------------- */
    // (lives here rather than mod_exotic: purely additive aliveness layer)
    var BH = ctx.eph.blackhole;
    var HOLE_R = ctx.layout.BLACKHOLE.holeRadius;
    var inN = Math.floor(420 * ctx.quality.particleScale) + 80;
    var inAng = new Float32Array(inN), inRad = new Float32Array(inN), inY = new Float32Array(inN);
    for (var bi = 0; bi < inN; bi++) {
      inAng[bi] = Math.random() * Math.PI * 2;
      inRad[bi] = HOLE_R * 1.3 + Math.random() * HOLE_R * 3.4;
      inY[bi] = (Math.random() - 0.5) * 1.6;
    }
    var inPos = new Float32Array(inN * 3);
    var inGeo = new THREE.BufferGeometry();
    inGeo.setAttribute('position', new THREE.BufferAttribute(inPos, 3));
    var infall = new THREE.Points(inGeo, new THREE.PointsMaterial({
      color: 0xffd9b0, size: 1.8, sizeAttenuation: false,
      transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    infall.frustumCulled = false;
    infall.renderOrder = 6;
    ctx.world.add(infall);
    var TILT = 18 * Math.PI / 180, tc = Math.cos(TILT), tsn = Math.sin(TILT);

    /* ------------- supernovae — the deep sky occasionally answers ---------- */
    var nova = glow([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(190,210,255,0.6)'],
                     [1, 'rgba(0,0,0,0)']], 1, 0);
    nova.visible = false;
    ctx.world.add(nova);
    var novaLife = -1, novaWait = 14 + Math.random() * 18;

    /* ------------- ambient dust: space is never empty ---------------------- */
    var DUSTN = Math.floor(200 * ctx.quality.particleScale) + 60;
    var dustPos = new Float32Array(DUSTN * 3);
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xaab8cc, size: 1.2, sizeAttenuation: false,
      transparent: true, opacity: 0.3, depthWrite: false }));
    dust.frustumCulled = false;
    ctx.world.add(dust);
    var dustR = -1;

    /* --------------------------- per-frame -------------------------------- */
    var tmp = new THREE.Vector3();
    ctx.onUpdate(function (dt, state) {
      // dust drifts past the camera at every scale — parallax makes motion felt
      var dr = Math.max(state.camDist * 0.55, 0.02);
      var cp = state.camPos;
      if (dustR < 0 || Math.abs(dr - dustR) > dustR * 0.5) {
        dustR = dr;
        for (var di = 0; di < DUSTN; di++) {
          dustPos[di * 3] = cp.x + (Math.random() - 0.5) * dr * 2;
          dustPos[di * 3 + 1] = cp.y + (Math.random() - 0.5) * dr * 2;
          dustPos[di * 3 + 2] = cp.z + (Math.random() - 0.5) * dr * 2;
        }
        dustGeo.attributes.position.needsUpdate = true;
      } else {
        var moved = false;
        for (var dj = 0; dj < DUSTN; dj++) {
          if (Math.abs(dustPos[dj * 3] - cp.x) > dr ||
              Math.abs(dustPos[dj * 3 + 1] - cp.y) > dr ||
              Math.abs(dustPos[dj * 3 + 2] - cp.z) > dr) {
            dustPos[dj * 3] = cp.x + (Math.random() - 0.5) * dr * 2;
            dustPos[dj * 3 + 1] = cp.y + (Math.random() - 0.5) * dr * 2;
            dustPos[dj * 3 + 2] = cp.z + (Math.random() - 0.5) * dr * 2;
            moved = true;
          }
        }
        if (moved) dustGeo.attributes.position.needsUpdate = true;
      }
      for (var i = 0; i < galaxies.length; i++) {
        var gx = galaxies[i];
        var d = tmp.copy(gx.C).sub(state.camPos).length();

        // near content exists only when someone is close enough to see it;
        // a galaxy's full star systems are generated on first approach
        var near = d < Math.max(6e5, gx.R * 30);
        if (gx.group.visible !== near) gx.group.visible = near;
        if (near && !gx.built) {
          gx.built = true;
          try { buildSystems(gx); } catch (e) { /* a galaxy without extras still lives */ }
        }

        // discovery: names are earned by arriving, and remembered forever
        if (!gx.known && d < gx.R * 2.2) {
          gx.known = true;
          discovered[gx.id] = 1;
          saveDiscovered();
          gx.focus.label = gx.name;
          ctx.addFact(gx.id, gx.arrive);
          ctx.toast('DISCOVERED — ' + gx.arrive, 10000);
        }

        // beacon: screen-constant, appears once the blob is worth wondering
        // about; the code sprite for strangers, the name for the discovered
        var px = gx.R * state.pixelsPerUnit(d);
        var show = state.labelsVisible && state.viewWidthUnits > 8e3 &&
                   d > gx.R * 1.2 && px > 2.2;
        var codeShow = show && !gx.known, nameShow = show && gx.known;
        if (gx.codeSprite.visible !== codeShow) gx.codeSprite.visible = codeShow;
        if (gx.nameSprite.visible !== nameShow) gx.nameSprite.visible = nameShow;
        if (show) {
          var h = 14 / state.pixelsPerUnit(d);
          var sp = gx.known ? gx.nameSprite : gx.codeSprite;
          sp.scale.set(h * (gx.known ? gx.aspectName : gx.aspectCode), h, 1);
        }

        // a visible galaxy is never frozen
        if (near) {
          var w = dt * state.timeScale;
          gx.cloud.rotation.y += w * 0.004;
          if (d < 2e5) {
            for (var s = 0; s < gx.spinners.length; s++) {
              gx.spinners[s][0].rotation.y += gx.spinners[s][1] * w;
            }
            for (var cu = 0; cu < gx.customs.length; cu++) gx.customs[cu](w, state.t);
            for (var nbi = 0; nbi < gx.nebs.length; nbi++) {
              var nb3 = gx.nebs[nbi];
              nb3.s.material.rotation += w * 0.01;
              nb3.s.material.opacity = nb3.o * (0.82 + 0.18 * Math.sin(state.t * 0.25 + nbi * 1.7));
            }
          }
        }
      }

      // black hole: matter spirals in whenever anyone is close enough to care
      if (tmp.copy(BH).sub(state.camPos).length() < 7000) {
        infall.visible = true;
        var iw = dt * state.timeScale;
        for (var p = 0; p < inN; p++) {
          inAng[p] += iw * 26 / Math.pow(inRad[p], 1.2);
          inRad[p] -= iw * (0.4 + 26 / inRad[p]);
          if (inRad[p] < HOLE_R * 1.05) {
            inRad[p] = HOLE_R * (2.5 + Math.random() * 2.2);
            inAng[p] = Math.random() * Math.PI * 2;
          }
          var lx = Math.cos(inAng[p]) * inRad[p];
          var lz = Math.sin(inAng[p]) * inRad[p];
          var ly = inY[p];
          inPos[p * 3] = BH.x + lx;
          inPos[p * 3 + 1] = BH.y + ly * tc - lz * tsn;
          inPos[p * 3 + 2] = BH.z + ly * tsn + lz * tc;
        }
        inGeo.attributes.position.needsUpdate = true;
      } else if (infall.visible) infall.visible = false;

      // occasional supernova: somewhere out there, a star ends
      novaWait -= dt;
      if (novaWait <= 0 && novaLife < 0) {
        var g2 = galaxies[(Math.random() * galaxies.length) | 0];
        nova.position.copy(g2.C);
        nova.position.x += (Math.random() - 0.5) * g2.R * 1.4;
        nova.position.z += (Math.random() - 0.5) * g2.R * 1.4;
        var ns = g2.R * 0.8;
        nova.scale.set(ns, ns, 1);
        nova.visible = true;
        novaLife = 0;
        novaWait = 16 + Math.random() * 24;
      }
      if (novaLife >= 0) {
        novaLife += dt;
        var k = novaLife / 4;
        nova.material.opacity = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.88);
        if (k >= 1) { novaLife = -1; nova.visible = false; }
      }
    });
  });
})();
