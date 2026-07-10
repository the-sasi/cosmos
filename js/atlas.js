/* atlas.js — the Cosmos Atlas: a universe/destination navigator.
   COSMOS's multi-universe navigation layer, built ENTIRELY on the existing
   engine surface (no engine.js edits). Any module can publish a destination
   with COSMOS.registerDestination({...}); the Atlas groups them by category
   and warps the camera there with the proven setFocusByName teleport — the
   same instant jump the wormhole uses — so distant universes are reachable
   even past the selectable() zoom gate that blocks click-travel from far out.

   This is the seed of the universe layer: today it lists the real Solar
   System + deep-space objects; every future universe (real, scientific or
   fictional) drops its places in here as pure data. */
(function () {
  'use strict';

  var COSMOS = window.COSMOS;
  if (!COSMOS) return;

  // shared registry — populated by this file's defaults and by any module
  var destinations = COSMOS.destinations = COSMOS.destinations || [];
  var rerender = null;            // set once the panel is built

  // dest: {id, label, category, focus, radiusMult?, blurb?, warn?, note?}
  //   focus     = name of a focusable already registered with the engine
  //   radiusMult = framing distance on arrival (default 4)
  //   blurb     = HUD toast shown on arrival
  //   note      = short right-hand hint in the menu row
  COSMOS.registerDestination = function (dest) {
    if (!dest || (!dest.focus && typeof dest.warp !== 'function')) return dest;
    destinations.push(dest);
    if (rerender) rerender();
    return dest;
  };

  COSMOS.register('atlas', function (ctx) {
    var root = document.getElementById('atlas');
    if (!root) return;
    var toggle = root.querySelector('.toggle');
    var panel = root.querySelector('.panel');
    if (!toggle || !panel) return;

    var L = ctx.layout;

    // ---- seed the first category: the real Solar System ------------------
    // (only bodies the engine already registers as focusables)
    var order = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    COSMOS.registerDestination({ id: 'sun', label: 'The Sun', category: 'Real · Solar System',
      focus: 'sun', radiusMult: 3, note: 'G-type star', order: 900 });
    order.forEach(function (k, i) {
      var p = L.PLANETS[k];
      COSMOS.registerDestination({ id: k, label: p.label, category: 'Real · Solar System',
        focus: k, radiusMult: k === 'earth' ? 3.2 : 4, order: 901 + i });
    });
    COSMOS.registerDestination({ id: 'moon', label: 'The Moon', category: 'Real · Solar System',
      focus: 'moon', radiusMult: 4, note: "Earth's moon", order: 910 });
    COSMOS.registerDestination({ id: 'blackhole', label: 'Black Hole', category: 'Real · Deep space',
      focus: 'blackhole', radiusMult: 6, warn: true, note: 'event horizon', order: 950 });
    COSMOS.registerDestination({ id: 'wormhole', label: 'Wormhole', category: 'Real · Deep space',
      focus: 'wormhole', radiusMult: 4, warn: true, note: 'hypothetical', order: 951 });

    // ---- warp ------------------------------------------------------------
    function warp(d) {
      ctx.flash(d.warn ? '#ffe4e4' : '#dfeaff', 300);
      if (typeof d.warp === 'function') d.warp(ctx);
      else COSMOS.setFocusByName(d.focus, { radiusMult: d.radiusMult || 4 });
      if (d.blurb) ctx.toast(d.blurb, 8000);
      close();
    }

    // ---- panel open / close ---------------------------------------------
    var isOpen = false;
    function open() {
      isOpen = true; panel.classList.add('open'); toggle.classList.add('on');
      toggle.classList.remove('pulse');            // discovered — stop calling attention
      paintHere();
    }
    function close() { isOpen = false; panel.classList.remove('open'); toggle.classList.remove('on'); }
    toggle.addEventListener('click', function () { isOpen ? close() : open(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });

    // ---- render (grouped by category; categories & rows sort by `order`,
    //      default 500 — new universes outrank the solar-system seeds) ------
    var rows = [];   // {el, dest}
    function ord(d) { return d.order !== undefined ? d.order : 500; }
    rerender = function () {
      var cats = [];
      var byCat = {};
      destinations.forEach(function (d) {
        if (!byCat[d.category]) { byCat[d.category] = { list: [], pri: 1e9 }; cats.push(d.category); }
        byCat[d.category].list.push(d);
        if (ord(d) < byCat[d.category].pri) byCat[d.category].pri = ord(d);
      });
      cats.sort(function (a, b) { return byCat[a].pri - byCat[b].pri; });
      panel.innerHTML = '';
      rows = [];
      cats.forEach(function (cat) {
        var h = document.createElement('div');
        h.className = 'cat';
        h.textContent = cat;
        panel.appendChild(h);
        byCat[cat].list.sort(function (a, b) { return ord(a) - ord(b); });
        byCat[cat].list.forEach(function (d) {
          var b = document.createElement('button');
          b.className = 'dest';
          b.innerHTML = '<span>' + d.label + '</span>' + (d.note ? '<span class="k">' + d.note + '</span>' : '');
          b.addEventListener('click', function () { warp(d); });
          panel.appendChild(b);
          rows.push({ el: b, dest: d });
        });
      });
      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'more universes coming — the cosmos keeps growing';
      panel.appendChild(hint);
      paintHere();
    };

    // highlight the destination you're currently at
    function paintHere() {
      var here = ctx.state.focusName;
      for (var i = 0; i < rows.length; i++) {
        rows[i].el.classList.toggle('here', rows[i].dest.focus === here);
      }
    }

    rerender();

    // cheap ~3 Hz highlight refresh while open + one-time discovery hint
    var acc = 0;
    var hinted = false;
    ctx.onUpdate(function (dt, state) {
      if (!hinted && state.t > 7 && !isOpen) {
        hinted = true;
        ctx.toast('New universes are open — press ◎ atlas (top right): One Piece, Solo Leveling, Dragon Ball, Naruto… each a separate world under its own sky.', 9500);
      }
      if (!isOpen) return;
      acc += dt;
      if (acc > 0.33) { acc = 0; paintHere(); }
    });
  });
})();
