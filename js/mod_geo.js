/* mod_geo.js — country borders, country names and major cities on the globe.
   One merged LineSegments batch for every border on Earth (single draw call);
   labels are lazily created and capped per frame so mobile stays smooth. */
(function () {
  'use strict';

  COSMOS.register('geo', function (ctx) {
    var THREE = ctx.THREE;
    var GEO = window.COSMOS_GEO;
    if (!GEO || !GEO.countries || !ctx.shared.earthSurface) return;

    var R = ctx.layout.PLANETS.earth.radius;
    var surf = ctx.shared.earthSurface;
    var low = ctx.quality.tier === 'low';

    function latLonToVec3(latDeg, lonDeg, r, out) {
      var phi = (90 - latDeg) * Math.PI / 180;
      var theta = (lonDeg + 180) * Math.PI / 180;
      out.set(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
      return out;
    }

    /* ---- borders: one merged geometry, one draw call ---------------------- */
    var BR = R * 1.0022;
    var segs = [];
    var va = new THREE.Vector3(), vb = new THREE.Vector3();
    GEO.countries.forEach(function (c) {
      c.r.forEach(function (ring) {
        for (var i = 0; i + 3 < ring.length; i += 2) {
          latLonToVec3(ring[i + 1], ring[i], BR, va);
          latLonToVec3(ring[i + 3], ring[i + 2], BR, vb);
          segs.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
        }
      });
    });
    var borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    var borderMat = new THREE.LineBasicMaterial({
      color: 0x86a8e0, transparent: true, opacity: 0, depthWrite: false
    });
    var borders = new THREE.LineSegments(borderGeo, borderMat);
    borders.renderOrder = 4;
    borders.visible = false;
    borders.frustumCulled = false;
    surf.add(borders);

    /* ---- country label anchors (sprites created lazily) ------------------- */
    var countries = GEO.countries.map(function (c) {
      var dir = latLonToVec3(c.c[0], c.c[1], 1, new THREE.Vector3()).clone();
      return { name: c.n, dir: dir, sprite: null, score: 0 };
    });

    /* ---- major cities ------------------------------------------------------ */
    var CITIES = [
      ['New Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Chennai', 13.08, 80.27],
      ['Bengaluru', 12.97, 77.59], ['Hyderabad', 17.39, 78.49], ['Kolkata', 22.57, 88.36],
      ['Coimbatore', 11.02, 76.96], ['Kochi', 9.93, 76.27],
      ['London', 51.51, -0.13], ['Paris', 48.86, 2.35], ['New York', 40.71, -74.01],
      ['Los Angeles', 34.05, -118.24], ['Tokyo', 35.68, 139.69], ['Beijing', 39.90, 116.41],
      ['Shanghai', 31.23, 121.47], ['Moscow', 55.76, 37.62], ['Singapore', 1.35, 103.82],
      ['Sydney', -33.87, 151.21], ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38],
      ['Rio de Janeiro', -22.91, -43.17], ['São Paulo', -23.55, -46.63],
      ['Mexico City', 19.43, -99.13], ['Toronto', 43.65, -79.38], ['Berlin', 52.52, 13.41],
      ['Rome', 41.90, 12.50], ['Istanbul', 41.01, 28.98], ['Seoul', 37.57, 126.98],
      ['Bangkok', 13.76, 100.50], ['Jakarta', -6.21, 106.85], ['Nairobi', -1.29, 36.82],
      ['Cape Town', -33.92, 18.42], ['Buenos Aires', -34.60, -58.38]
    ];
    var cityPos = new Float32Array(CITIES.length * 3);
    var cities = CITIES.map(function (c, i) {
      var dir = latLonToVec3(c[1], c[2], 1, new THREE.Vector3()).clone();
      cityPos[i * 3] = dir.x * R * 1.0025;
      cityPos[i * 3 + 1] = dir.y * R * 1.0025;
      cityPos[i * 3 + 2] = dir.z * R * 1.0025;
      return { name: c[0], dir: dir, sprite: null, score: 0 };
    });
    var cityGeo = new THREE.BufferGeometry();
    cityGeo.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
    var cityDots = new THREE.Points(cityGeo, new THREE.PointsMaterial({
      color: 0xffd9a6, size: 3, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false
    }));
    cityDots.renderOrder = 4;
    cityDots.visible = false;
    cityDots.frustumCulled = false;
    surf.add(cityDots);

    function makeLabel(item, color, fontPx) {
      item.sprite = ctx.makeTextSprite(item.name, { fontPx: fontPx, color: color });
      item.sprite.visible = false;
      item.sprite.position.copy(item.dir).multiplyScalar(R * 1.004);
      surf.add(item.sprite);
    }

    /* ---- per-frame ---------------------------------------------------------- */
    var tmpA = new THREE.Vector3();
    var tmpC = new THREE.Vector3();
    var camDir = new THREE.Vector3();
    var scr = { x: 0, y: 0, front: false, dist: 0 };
    var C_CAP = low ? 12 : 20;      // max country labels on screen
    var CT_CAP = low ? 9 : 14;      // max city labels on screen
    var C_PX = 12.5, CT_PX = 11.5;
    var shown = [];                  // reused scratch

    function updateLabelSet(items, gateOn, cap, px, color, fontPx, state, mw) {
      shown.length = 0;
      var w = ctx.renderer.domElement.clientWidth;
      var h = ctx.renderer.domElement.clientHeight;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!gateOn) { if (it.sprite) it.sprite.visible = false; continue; }
        tmpA.copy(it.dir).applyMatrix4(mw);           // surface point, render space
        // facing test without allocation:
        var fx = tmpA.x - tmpC.x, fy = tmpA.y - tmpC.y, fz = tmpA.z - tmpC.z;
        var fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
        var face = (fx * camDir.x + fy * camDir.y + fz * camDir.z) / fl;
        if (face < 0.18) { if (it.sprite) it.sprite.visible = false; continue; }
        // project (render space == world space with camera at origin)
        var d = tmpA.length();
        tmpA.project(ctx.camera);
        if (tmpA.z > 1) { if (it.sprite) it.sprite.visible = false; continue; }
        var sx = (tmpA.x * 0.5 + 0.5) * w, sy = (-tmpA.y * 0.5 + 0.5) * h;
        if (sx < 30 || sx > w - 30 || sy < 26 || sy > h - 88) {   // clear of the HUD
          if (it.sprite) it.sprite.visible = false; continue;
        }
        it.score = Math.hypot(sx - w / 2, sy - h / 2);
        it.dist = d;
        it.sx = sx; it.sy = sy;
        shown.push(it);
      }
      if (!gateOn) return;
      shown.sort(function (a, b) { return a.score - b.score; });
      var placed = 0;
      for (var j = 0; j < shown.length; j++) {
        var s = shown[j];
        var ok = placed < cap;
        if (ok) {                                     // greedy anti-overlap
          for (var a = 0; a < accN; a++) {
            if (Math.abs(accX[a] - s.sx) < 110 && Math.abs(accY[a] - s.sy) < 16) { ok = false; break; }
          }
        }
        if (ok) {
          accX[accN] = s.sx; accY[accN] = s.sy; accN++; placed++;
          if (!s.sprite) makeLabel(s, color, fontPx);
          s.sprite.visible = true;
          var hw = px / state.pixelsPerUnit(s.dist);
          s.sprite.scale.set(hw * s.sprite.userData.aspect, hw, 1);
        } else if (s.sprite) s.sprite.visible = false;
      }
    }
    var accX = new Float32Array(64), accY = new Float32Array(64), accN = 0;

    var mwCache = null;
    ctx.onUpdate(function (dt, state) {
      tmpC.copy(ctx.eph.earth).sub(state.camPos);      // earth centre, render space
      var altE = tmpC.length() - R;
      var near = altE < 1.6;
      if (!near) {
        if (borders.visible) {
          borders.visible = false; cityDots.visible = false;
          updateLabelSet(countries, false, 0, 0, '', 0, state, null);
          updateLabelSet(cities, false, 0, 0, '', 0, state, null);
        }
        mwCache = null;
        return;
      }
      var cl = tmpC.length() || 1;
      camDir.copy(tmpC).multiplyScalar(-1 / cl);
      mwCache = surf.matrixWorld;

      // borders fade in from 9,000 km down to 3,200 km altitude
      var bo = 1 - Math.min(Math.max((altE - 0.5) / 0.9, 0), 1);
      borderMat.opacity = bo * 0.42;
      borders.visible = bo > 0.01;

      // cities fade in below ~1,600 km
      var co = 1 - Math.min(Math.max((altE - 0.1) / 0.15, 0), 1);
      cityDots.material.opacity = co * 0.9;
      cityDots.visible = co > 0.01;

      accN = 0;   // countries and cities share one anti-overlap field per frame
      updateLabelSet(countries, altE < 1.0 && state.labelsVisible, C_CAP, C_PX, '#cdd8ec', 40, state, mwCache);
      updateLabelSet(cities, altE < 0.25 && state.labelsVisible, CT_CAP, CT_PX, '#ffd9a6', 36, state, mwCache);
    });

    /* ---- click: dive to a country or city ----------------------------------- */
    var dirW = new THREE.Vector3();
    function tryDive(items, x, y, alt, maxPx) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.sprite || !it.sprite.visible) continue;
        if (Math.hypot(it.sx - x, it.sy - y) < maxPx) {
          dirW.copy(it.dir).transformDirection(surf.matrixWorld);
          COSMOS.focusEarthPoint(dirW, alt);
          return true;
        }
      }
      return false;
    }
    ctx.onClick(function (x, y) {
      if (!mwCache) return false;
      if (tryDive(cities, x, y, 0.02, 20)) return true;      // ~130 km over the city
      if (tryDive(countries, x, y, 0.35, 24)) return true;   // country-framing height
      return false;
    });
  });
})();
