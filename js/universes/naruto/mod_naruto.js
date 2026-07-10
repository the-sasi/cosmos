/* mod_naruto.js — the NARUTO universe: a separate pocket of space holding
   the Shinobi World — a single globe mapping the Five Great Shinobi Nations
   (Land of Fire at the centre, Wind to the south-west, Earth to the
   north-west, Lightning to the north-east, Water's islands to the east)
   with their hidden villages as travel targets. The sky is dark, drifting
   with red clouds. Canon: Masashi Kishimoto's Naruto. */
(function () {
  'use strict';

  COSMOS.register('naruto', function (ctx) {
    var THREE = ctx.THREE;
    if (!COSMOS.createUniverse) return;

    var u = COSMOS.createUniverse(ctx, {
      id: 'naruto',
      center: [-38000, 5200, -58000],
      radius: 420,
      theme: {
        base: '#0d0714',                                   // moonless night
        nebulae: [
          { rgb: '160,30,40', n: 8 },                      // red clouds
          { rgb: '200,200,215', n: 2 }                     // pale moonlight
        ],
        starColor: '#ffe0d8',
        starCount: 1200,
        glint: '#ff6a5a'
      }
    });

    // the Five Great Nations, painted schematically on one continent-sea
    var REGIONS = [
      { color: '#5f8a4a', lat: 6,   lon: 16,  rx: 0.075, ry: 0.055 },  // Fire (centre)
      { color: '#c9a15a', lat: -13, lon: -16, rx: 0.07,  ry: 0.05 },   // Wind (SW desert)
      { color: '#8a6a4a', lat: 23,  lon: -24, rx: 0.06,  ry: 0.045 },  // Earth (NW mountains)
      { color: '#7a7f8a', lat: 28,  lon: 44,  rx: 0.05,  ry: 0.04 },   // Lightning (NE peaks)
      { color: '#5a7a8a', lat: -3,  lon: 60,  rx: 0.028, ry: 0.02 },   // Water (E islands)
      { color: '#5a7a8a', lat: -9,  lon: 66,  rx: 0.02,  ry: 0.015 },
      { color: '#5a7a8a', lat: 3,   lon: 67,  rx: 0.016, ry: 0.012 }
    ];

    function makeShinobiTex() {
      var W = ctx.quality.texSize * 2, H = ctx.quality.texSize;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.fillStyle = '#1d3a52'; g.fillRect(0, 0, W, H);            // sea
      function X(lon) { return ((lon + 180) / 360) * W; }
      function Y(lat) { return ((90 - lat) / 180) * H; }
      // one joined mainland under the western nations, then region tints
      g.fillStyle = '#6f7f56';
      g.beginPath(); g.ellipse(X(8), Y(8), W * 0.11, H * 0.22, 0.2, 0, 6.2832); g.fill();
      REGIONS.forEach(function (r) {
        g.fillStyle = r.color;
        g.beginPath();
        g.ellipse(X(r.lon), Y(r.lat), W * r.rx, H * (r.ry * 2), Math.random() * 0.6 - 0.3, 0, 6.2832);
        g.fill();
      });
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    COSMOS.buildWorld(ctx, u, {
      id: 'naruto', label: 'The Shinobi World', R: 1.0,
      tex: makeShinobiTex(), atmColor: '#8fb0d0',
      specular: '#2a3a45', shininess: 14,
      category: 'Anime · Naruto', order: 4, note: 'five nations',
      blurb: 'The Shinobi World — five great nations shaped by chakra, hidden villages, and the ninja who carry their will of fire.',
      markers: [
        { id: 'konoha', name: 'Konohagakure', lat: 6, lon: 16, color: '#7fd06a', atlas: true, note: 'Hidden Leaf',
          blurb: 'The Hidden Leaf — village of the Hokage in the Land of Fire; home of Naruto Uzumaki, Team 7 and the Will of Fire.' },
        { id: 'suna', name: 'Sunagakure', lat: -13, lon: -16, color: '#e8c88a', atlas: true, note: 'Hidden Sand',
          blurb: 'The Hidden Sand — desert village of the Kazekage in the Land of Wind; home of Gaara of the Sand.' },
        { id: 'kiri', name: 'Kirigakure', lat: -3, lon: 60, color: '#8ac8e8', atlas: true, note: 'Hidden Mist',
          blurb: 'The Hidden Mist — island village of the Mizukage in the Land of Water, once feared as the Village of the Bloody Mist.' },
        { id: 'iwa', name: 'Iwagakure', lat: 23, lon: -24, color: '#c8a87a', atlas: true, note: 'Hidden Stone',
          blurb: 'The Hidden Stone — mountain fortress of the Tsuchikage in the Land of Earth.' },
        { id: 'kumo', name: 'Kumogakure', lat: 28, lon: 44, color: '#e8e86a', atlas: true, note: 'Hidden Cloud',
          blurb: 'The Hidden Cloud — village of the Raikage, built among lightning-wreathed peaks in the Land of Lightning.' }
      ]
    });
  });
})();
