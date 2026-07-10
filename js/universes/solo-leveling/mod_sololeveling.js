/* mod_sololeveling.js — the SOLO LEVELING universe: a separate pocket of
   space holding its OWN Earth — a dark "Hunter's world" globe with glowing
   country borders (reusing COSMOS_GEO data) and dimensional Gates pinned at
   their canonical real-world coordinates: Seoul (Hunters Association, the
   double dungeon), Jeju (the S-rank Ant raid / Beru), Tokyo (the giant-army
   dungeon break), the US west coast (Kamish's Wrath), and the homelands of
   the National Level Hunters. Blue rifts = Gates; crimson = S-rank
   catastrophes. Sky: near-black indigo torn by violet mana.
   Sources: Solo Leveling Wiki (Chugong). */
(function () {
  'use strict';

  COSMOS.register('sololeveling', function (ctx) {
    var THREE = ctx.THREE;
    if (!COSMOS.createUniverse) return;

    // ---- the pocket universe: shadow-monarch sky -------------------------
    var u = COSMOS.createUniverse(ctx, {
      id: 'sololevel',
      center: [-52000, -3000, 76000],
      radius: 420,
      theme: {
        base: '#070313',                                  // near-black indigo
        nebulae: [
          { rgb: '106,13,173', n: 7 },                    // royal violet mana
          { rgb: '30,100,220', n: 4 },                    // gate blue
          { rgb: '150,20,40', n: 3 }                      // red-gate warnings
        ],
        starColor: '#cfd0ff',
        starCount: 1100,
        glint: '#a86ae8'
      }
    });

    // ---- portal rift textures (built once) --------------------------------
    function makePortal(coreRGBA, rimRGB) {
      var w = 64, h = 128, c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d');
      g.translate(w / 2, h / 2); g.scale(0.5, 1.0);          // tall rift
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, h / 2);
      gr.addColorStop(0.0, coreRGBA);
      gr.addColorStop(0.55, 'rgba(' + rimRGB + ',0.55)');
      gr.addColorStop(0.8, 'rgba(' + rimRGB + ',0.9)');
      gr.addColorStop(1.0, 'rgba(' + rimRGB + ',0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h / 2, 0, 6.2832); g.fill();
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    var portalBlue = makePortal('rgba(120,180,255,0.95)', '30,144,255');
    var portalRed = makePortal('rgba(255,120,120,0.95)', '193,18,31');

    // ---- the Hunter's Earth (dark globe; borders added below) -------------
    function makeHunterEarthTex() {
      var W = ctx.quality.texSize * 2, H = ctx.quality.texSize;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d');
      var grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#0a1226');
      grd.addColorStop(0.5, '#0e1a33');
      grd.addColorStop(1, '#0a1226');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // faint mana shimmer
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 160; i++) {
        var x = Math.random() * W, y = Math.random() * H;
        var r = (5 + Math.random() * 30) * (ctx.quality.texSize / 1024);
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(90,80,180,0.05)');
        gr.addColorStop(1, 'rgba(90,80,180,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    var R = 1.0;
    var world = COSMOS.buildWorld(ctx, u, {
      id: 'sololevel', label: "Hunter's Earth", R: R,
      tex: makeHunterEarthTex(), atmColor: '#6a4ae0',
      specular: '#1a2a45', shininess: 30,
      category: 'Anime · Solo Leveling', order: 2, note: 'gates open',
      blurb: 'Earth after the Gates opened — dungeons, mana and Hunters. This is the world of Sung Jinwoo, the Shadow Monarch.',
      markers: [
        { id: 'seoul', name: 'Seoul', lat: 37.5665, lon: 126.9780, color: '#9fc8ff',
          tex: portalBlue, tall: true, size: 0.024, note: 'hub', atlas: true,
          blurb: 'Seoul, South Korea — heart of the Hunter world: the Korean Hunters Association, the great guilds, and the rise of the Shadow Monarch, Sung Jinwoo.' },
        { id: 'dungeon', name: 'The Double Dungeon', lat: 37.5568, lon: 126.9237, color: '#9fc8ff',
          tex: portalBlue, tall: true, size: 0.02, note: 'D-rank gate', atlas: true,
          blurb: 'The D-rank gate hiding the Cartenon Temple — where the world\'s weakest E-rank Hunter died, was chosen by the System, and became the Player.' },
        { id: 'jeju', name: 'Jeju Island Gate', lat: 33.362, lon: 126.533, color: '#ff9d9d',
          tex: portalRed, tall: true, size: 0.028, note: 'S-rank', atlas: true, labelColor: '#ff9d9d',
          blurb: 'Jeju Island — the S-rank Ant colony. Korea\'s deadliest raid; here the Ant King fell and rose again as Jinwoo\'s marshal shadow, Beru.' },
        { id: 'tokyo', name: 'Tokyo S-Rank Gate', lat: 35.6762, lon: 139.6503, color: '#ff9d9d',
          tex: portalRed, tall: true, size: 0.028, note: 'S-rank', atlas: true, labelColor: '#ff9d9d',
          blurb: 'Tokyo — an S-rank gate that broke, loosing the Monarch Legia\'s army of Giants. Jinwoo\'s Shadow Army answered where nations could not.' },
        { id: 'kamish', name: "Kamish's Wrath", lat: 34.05, lon: -118.24, color: '#ff9d9d',
          tex: portalRed, tall: true, size: 0.028, note: 'S-rank', atlas: true, labelColor: '#ff9d9d',
          blurb: 'The US west coast — the first S-rank gate in history. The dragon Kamish killed a million; the five surviving S-ranks became the first National Level Hunters.' },
        { id: 'china', name: 'Liu Zhigang', lat: 39.90, lon: 116.41, color: '#ffd9a6',
          size: 0.016, note: 'National', atlas: true,
          blurb: 'China — home of Liu Zhigang, a National Level Hunter. Only a handful exist worldwide; each is reckoned equal to a nation\'s army.' },
        { id: 'india', name: 'Siddharth Bachchan', lat: 28.61, lon: 77.21, color: '#ffd9a6',
          size: 0.016, note: 'National', atlas: true,
          blurb: 'India — home of Siddharth Bachchan, National Level Hunter, one of the five survivors of Kamish.' },
        { id: 'france', name: 'Antoine Martinez', lat: 48.86, lon: 2.35, color: '#ffd9a6',
          size: 0.016, note: 'National', atlas: true,
          blurb: 'France — home of the healer Antoine Martinez, the "lost" fifth National Level Hunter.' }
      ]
    });

    // ---- glowing country borders on the Hunter's Earth --------------------
    // (reuses the real border data already shipped for the real Earth)
    var GEO = window.COSMOS_GEO;
    if (GEO && GEO.countries) {
      var BR = R * 1.0022;
      var segs = [];
      var va = new THREE.Vector3(), vb = new THREE.Vector3();
      GEO.countries.forEach(function (cn) {
        cn.r.forEach(function (ring) {
          for (var i = 0; i + 3 < ring.length; i += 2) {
            COSMOS.latLonToVec3(ring[i + 1], ring[i], BR, va);
            COSMOS.latLonToVec3(ring[i + 3], ring[i + 2], BR, vb);
            segs.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
          }
        });
      });
      var bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
      var borders = new THREE.LineSegments(bGeo, new THREE.LineBasicMaterial({
        color: 0x35618a, transparent: true, opacity: 0.42, depthWrite: false
      }));
      borders.renderOrder = 4;
      borders.frustumCulled = false;
      world.group.add(borders);
    }
  });
})();
