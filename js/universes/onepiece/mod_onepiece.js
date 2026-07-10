/* mod_onepiece.js — the ONE PIECE universe: a separate pocket of space
   holding "the Blue Planet", an ocean world with a canon-accurate map
   (Red Line ring at lon 0/180, Grand Line along the equator crossing it at
   Reverse Mountain and Mary Geoise/Fish-Man Island, twin Calm Belts, the
   four Blues as quadrants, ~28 islands in true story order — see
   data_onepiece.js, sourced from the One Piece Wiki).
   Enter it via the Cosmos Atlas: inside its sky shell, the real universe
   disappears — only the pirate sky remains. */
(function () {
  'use strict';

  COSMOS.register('onepiece', function (ctx) {
    var THREE = ctx.THREE;
    var Q = ctx.quality;
    var D = window.ONEPIECE;
    if (!D || !COSMOS.createUniverse) return;

    // ---- the pocket universe: warm adventure sky ------------------------
    var u = COSMOS.createUniverse(ctx, {
      id: 'onepiece',
      center: D.center,
      radius: 420,
      theme: {
        base: '#041420',                                   // deep sea-sky navy
        nebulae: [
          { rgb: '212,164,90', n: 5 },                     // treasure gold
          { rgb: '64,150,200', n: 6 },                     // cerulean
          { rgb: '190,90,110', n: 3 }                      // sunset rose
        ],
        starColor: '#cfe8ff',
        starCount: 1500,
        glint: '#8fd0ff'
      }
    });

    // ---- paint the canon map (equirectangular) --------------------------
    function ll2x(lon, W) { var L = lon; while (L > 180) L -= 360; while (L < -180) L += 360; return ((L + 180) / 360) * W; }
    function ll2y(lat, H) { return ((90 - lat) / 180) * H; }

    function makeMapTexture() {
      var W = Q.texSize * 2, H = Q.texSize;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d');

      g.fillStyle = '#0b3468'; g.fillRect(0, 0, W, H);          // base ocean

      // four Blues — quadrants split by the Red Line (x = W/2 and the seam)
      // and the Grand Line (y = H/2)
      g.globalAlpha = 0.55;
      g.fillStyle = '#143d73'; g.fillRect(W / 2, 0, W / 2, H / 2);     // North Blue
      g.fillStyle = '#10437e'; g.fillRect(W / 2, H / 2, W / 2, H / 2); // East Blue
      g.fillStyle = '#0f3768'; g.fillRect(0, 0, W / 2, H / 2);         // West Blue
      g.fillStyle = '#0c3160'; g.fillRect(0, H / 2, W / 2, H / 2);     // South Blue
      g.globalAlpha = 1;

      // Calm Belts — windless, Sea-King-infested bands hugging the Grand Line
      var cb = H * 0.03;
      g.fillStyle = 'rgba(4,9,24,0.5)';
      g.fillRect(0, H / 2 - cb * 2.1, W, cb);
      g.fillRect(0, H / 2 + cb * 1.1, W, cb);

      // Grand Line — a faint bright sea-road along the equator
      g.fillStyle = 'rgba(150,212,236,0.18)';
      g.fillRect(0, H / 2 - H * 0.006, W, H * 0.012);

      // Red Line — the continent ring at lon 0 (x = W/2) and lon 180 (seam)
      var rw = W * 0.017;
      g.fillStyle = '#7c3c29';
      g.fillRect(W / 2 - rw / 2, 0, rw, H);
      g.fillRect(0, 0, rw / 2, H); g.fillRect(W - rw / 2, 0, rw / 2, H);
      g.fillStyle = 'rgba(158,86,58,0.55)';
      g.fillRect(W / 2 - rw * 0.62, 0, rw * 0.22, H);
      g.fillRect(W - rw * 0.22, 0, rw * 0.22, H);

      // islands (surface ones only — Skypiea floats, Fish-Man Island is deep)
      var ts = Q.texSize / 1024;
      D.islands.forEach(function (is) {
        if (is.alt) return;
        var x = ll2x(is.lon, W), y = ll2y(is.lat, H);
        var r = (is.cluster ? 9 : 5.5) * ts;
        [0, -W, W].forEach(function (ox) {
          var px = x + ox; if (px < -30 || px > W + 30) return;
          g.fillStyle = is.color;
          g.beginPath(); g.ellipse(px, y, r * 1.25, r, 0, 0, 6.2832); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.4; g.stroke();
          if (is.cluster) {
            for (var k = 0; k < 4; k++) {
              g.beginPath();
              g.arc(px + (Math.random() - 0.5) * r * 3.4, y + (Math.random() - 0.5) * r * 2.4, r * 0.5, 0, 6.2832);
              g.fill();
            }
          }
        });
      });

      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    }

    // ---- the Blue Planet + all islands via the world builder ------------
    COSMOS.buildWorld(ctx, u, {
      id: 'onepiece', label: 'The Blue Planet', R: D.R,
      tex: makeMapTexture(), atmColor: '#7fc9ff',
      specular: '#27506f', shininess: 24,
      category: 'Anime · One Piece', order: 1, note: 'ocean world',
      blurb: 'The One Piece world — one endless ocean split by the Red Line and the Grand Line. Somewhere out here waits the treasure of the Pirate King.',
      markers: D.islands.map(function (is) {
        return {
          id: is.id, name: is.name, lat: is.lat, lon: is.lon, alt: is.alt,
          color: is.color, size: D.R * (is.cluster ? 0.047 : 0.034),
          note: is.half, blurb: is.blurb, atlas: is.atlas
        };
      })
    });
  });
})();
