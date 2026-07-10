/* mod_dragonball.js — the DRAGON BALL universe (Universe 7): a separate
   pocket of space holding the saga's key worlds — Earth, Planet Namek,
   Planet Vegeta and King Kai's tiny high-gravity world — under a vivid
   orange-and-blue sky. Canon: Akira Toriyama's Dragon Ball / Z / Super. */
(function () {
  'use strict';

  COSMOS.register('dragonball', function (ctx) {
    var THREE = ctx.THREE;
    if (!COSMOS.createUniverse) return;

    var u = COSMOS.createUniverse(ctx, {
      id: 'dragonball',
      center: [64000, 7000, 30000],
      radius: 420,
      theme: {
        base: '#0a1030',                                   // saturated night blue
        nebulae: [
          { rgb: '235,140,40', n: 6 },                     // dragon-ball orange
          { rgb: '80,170,230', n: 4 },                     // ki blue
          { rgb: '240,210,90', n: 3 }                      // star gold
        ],
        starColor: '#ffe9c0',
        starCount: 1600,
        glint: '#ffb84a'
      }
    });

    // simple stylized planet texture: base ocean + blob continents (+ caps)
    function makeWorldTex(base, blobs, caps) {
      var W = ctx.quality.texSize * 2, H = ctx.quality.texSize;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      blobs.forEach(function (b) {
        g.fillStyle = b[0];
        for (var i = 0; i < b[1]; i++) {
          var x = Math.random() * W, y = H * (0.12 + Math.random() * 0.76);
          var rx = W * (0.02 + Math.random() * 0.06), ry = rx * (0.4 + Math.random() * 0.5);
          g.beginPath(); g.ellipse(x, y, rx, ry, Math.random() * 3.14, 0, 6.2832); g.fill();
          // wrap blobs across the seam so the map tiles cleanly
          if (x < rx) { g.beginPath(); g.ellipse(x + W, y, rx, ry, 0, 0, 6.2832); g.fill(); }
          if (x > W - rx) { g.beginPath(); g.ellipse(x - W, y, rx, ry, 0, 0, 6.2832); g.fill(); }
        }
      });
      if (caps) {
        g.fillStyle = caps;
        g.fillRect(0, 0, W, H * 0.05);
        g.fillRect(0, H * 0.95, W, H * 0.05);
      }
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    var CAT = 'Anime · Dragon Ball';

    // Earth — home of the Z Fighters
    COSMOS.buildWorld(ctx, u, {
      id: 'dbz_earth', label: 'Earth (Dragon Ball)', R: 1.0, offset: [0, 0, 60],
      tex: makeWorldTex('#2a6fc0', [['#4f9a4f', 26], ['#c9b06a', 8]], '#e8eef2'),
      atmColor: '#7fb9ff', category: CAT, order: 3, note: 'Z Fighters',
      blurb: 'Earth — home of Goku, the Z Fighters, Kame House and the World Martial Arts Tournament. Saved (and restored by the Dragon Balls) more times than anyone can count.'
    });

    // Planet Namek — green seas, three suns
    COSMOS.buildWorld(ctx, u, {
      id: 'dbz_namek', label: 'Planet Namek', R: 1.25, offset: [130, 12, -70],
      tex: makeWorldTex('#2f7d5f', [['#7fb069', 20], ['#3a6a8a', 6]]),
      atmColor: '#9fe0b0', category: CAT, order: 3.2, note: 'three suns',
      blurb: 'Planet Namek — green-skied homeworld of the Namekians, lit by three suns that never all set. Its Dragon Balls summon Porunga; here Goku first became a Super Saiyan against Frieza.'
    });

    // Planet Vegeta — the lost Saiyan homeworld
    COSMOS.buildWorld(ctx, u, {
      id: 'dbz_vegeta', label: 'Planet Vegeta', R: 1.4, offset: [-120, -10, -85],
      tex: makeWorldTex('#8a4a34', [['#b0644a', 22], ['#6a3626', 10]]),
      atmColor: '#e0876a', category: CAT, order: 3.4, note: 'Saiyan homeworld',
      blurb: 'Planet Vegeta — high-gravity homeworld of the Saiyan warrior race, destroyed by Frieza. The infant Kakarot — Goku — was launched to Earth just before the end.'
    });

    // King Kai's planet — tiny, at the end of Snake Way
    COSMOS.buildWorld(ctx, u, {
      id: 'dbz_kingkai', label: "King Kai's Planet", R: 0.06, offset: [4, 24, 64],
      tex: makeWorldTex('#5fa04f', [['#79b45f', 14], ['#e8e0c8', 4]]),
      category: CAT, order: 3.6, note: '10× gravity',
      blurb: "King Kai's Planet — a tiny world at the end of Snake Way in the Other World, with ten times Earth's gravity. Here Goku learned the Kaio-ken and the Spirit Bomb."
    });
  });
})();
