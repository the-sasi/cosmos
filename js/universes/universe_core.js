/* universe_core.js — the SEPARATE-UNIVERSE framework for COSMOS.
   Every universe is its own pocket of space, far from everything else, sealed
   inside an opaque themed sky shell: once the camera is inside, the Milky Way,
   the deep sky, the solar system and every other universe are hidden behind
   the shell's depth — you are somewhere else entirely, under a different sky.
   From outside, a universe is just a colored beacon star (clickable, and
   listed in the Cosmos Atlas).

   API (used by universe modules; zero engine edits):
     var u = COSMOS.createUniverse(ctx, {id, center:[x,y,z], radius, theme})
       theme: {base:'#rrggbb', nebulae:[{rgb:'r,g,b', n}], starColor, starCount, glint}
       -> {id, root (Group at center), center (Vector3), radius, glint}
     COSMOS.buildWorld(ctx, u, opts) — a globe + markers + labels + lore inside u:
       opts: {id, label, R, offset, tex, atmColor, specular, shininess,
              category, order, note, blurb, markers:[{id,name,lat,lon,alt,color,
              tex,tall,size,note,blurb,atlas,order,labelColor}]}
       -> {group, center, markers}                                           */
(function () {
  'use strict';
  var COSMOS = window.COSMOS;
  if (!COSMOS) return;

  var registry = COSMOS.UNIVERSES = [];
  var updaterOn = false;
  var dotTexCache = null;

  // soft round beacon/marker texture (built once)
  function getDotTex(THREE) {
    if (dotTexCache) return dotTexCache;
    var s = 64, c = document.createElement('canvas'); c.width = s; c.height = s;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    dotTexCache = new THREE.CanvasTexture(c);
    dotTexCache.colorSpace = THREE.SRGBColorSpace;
    return dotTexCache;
  }

  // themed sky: base color + soft nebula blotches + baked star specks
  function makeSkyTexture(ctx, theme) {
    var THREE = ctx.THREE;
    var W = ctx.quality.texSize, H = ctx.quality.texSize / 2;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = theme.base || '#04060f';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    (theme.nebulae || []).forEach(function (nb) {
      for (var i = 0; i < (nb.n || 5); i++) {
        var x = Math.random() * W, y = H * (0.15 + Math.random() * 0.7);
        var r = H * (0.10 + Math.random() * 0.26);
        var a = 0.08 + Math.random() * 0.12;
        var gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(' + nb.rgb + ',' + a.toFixed(3) + ')');
        gr.addColorStop(0.55, 'rgba(' + nb.rgb + ',' + (a * 0.35).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + nb.rgb + ',0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    for (var s = 0; s < 170; s++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.14 + Math.random() * 0.4).toFixed(2) + ')';
      g.beginPath();
      g.arc(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 1.1, 0, 6.2832);
      g.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function ensureUpdater(ctx) {
    if (updaterOn) return;
    updaterOn = true;
    ctx.onUpdate(function (dt, state) {
      for (var i = 0; i < registry.length; i++) {
        var u = registry[i];
        var d = state.camPos.distanceTo(u.center);
        // beacon star from afar; local stars only once you're approaching
        u.glint.visible = d > u.radius * 1.1;
        if (u.glint.visible) {
          var gs = 7 / state.pixelsPerUnit(d);
          u.glint.scale.set(gs, gs, 1);
        }
        u.stars.visible = d < u.radius * 3;
      }
    });
  }

  COSMOS.createUniverse = function (ctx, opts) {
    var THREE = ctx.THREE;
    var theme = opts.theme || {};
    var center = new THREE.Vector3().fromArray(opts.center);
    var root = new THREE.Group();
    root.position.copy(center);
    ctx.world.add(root);

    // opaque sky shell — the wall between this universe and everything else
    var segs = ctx.quality.tier === 'low' ? 32 : 48;
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, segs, Math.round(segs * 0.62)),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(ctx, theme), side: THREE.BackSide })
    );
    shell.frustumCulled = false;
    shell.renderOrder = -1;
    root.add(shell);

    // local stars — screen-constant points inside the shell
    var N = Math.floor((theme.starCount || 1200) * ctx.quality.particleScale);
    var pos = new Float32Array(N * 3);
    var v = new THREE.Vector3();
    for (var i = 0; i < N; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
      v.normalize().multiplyScalar(opts.radius * (0.35 + Math.random() * 0.55));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    var pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var stars = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: new THREE.Color(theme.starColor || '#cfd8ff'),
      size: 2.0, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false
    }));
    stars.frustumCulled = false;
    root.add(stars);

    // far-visibility beacon (screen-clamped; clickable via the planet focus)
    var glint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getDotTex(THREE), color: new THREE.Color(theme.glint || '#9fc4ff'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glint.renderOrder = 6;
    root.add(glint);

    var u = { id: opts.id, root: root, center: center, radius: opts.radius,
              glint: glint, stars: stars };
    registry.push(u);
    ensureUpdater(ctx);
    return u;
  };

  // standard equirectangular mapping (matches three.js sphere UVs)
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
  COSMOS.latLonToVec3 = latLonToVec3;

  COSMOS.buildWorld = function (ctx, u, opts) {
    var THREE = ctx.THREE;
    var off = opts.offset ? new THREE.Vector3().fromArray(opts.offset) : new THREE.Vector3();
    var center = u.center.clone().add(off);            // logical, static
    var grp = new THREE.Group();
    grp.position.copy(off);
    u.root.add(grp);

    var segW = ctx.quality.tier === 'low' ? 44 : 72;
    var segH = ctx.quality.tier === 'low' ? 30 : 48;
    var globe = new THREE.Mesh(
      new THREE.SphereGeometry(opts.R, segW, segH),
      new THREE.MeshPhongMaterial({
        map: opts.tex,
        specular: new THREE.Color(opts.specular || '#223a50'),
        shininess: opts.shininess !== undefined ? opts.shininess : 20
      })
    );
    grp.add(globe);

    if (opts.atmColor) {
      var atm = new THREE.Mesh(
        new THREE.SphereGeometry(opts.R * 1.035, segW, segH),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(opts.atmColor) } },
          vertexShader: [
            'varying vec3 vN; varying vec3 vView;',
            '#include <common>',
            '#include <logdepthbuf_pars_vertex>',
            'void main() {',
            '  vN = normalize(normalMatrix * normal);',
            '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '  vView = normalize(-mv.xyz);',
            '  gl_Position = projectionMatrix * mv;',
            '  #include <logdepthbuf_vertex>',
            '}'
          ].join('\n'),
          fragmentShader: [
            'uniform vec3 uColor; varying vec3 vN; varying vec3 vView;',
            '#include <common>',
            '#include <logdepthbuf_pars_fragment>',
            'void main() {',
            '  #include <logdepthbuf_fragment>',
            '  float f = pow(1.0 - max(dot(vN, vView), 0.0), 2.4);',
            '  gl_FragColor = vec4(uColor, f * 0.9);',
            '}'
          ].join('\n'),
          transparent: true, blending: THREE.AdditiveBlending,
          side: THREE.BackSide, depthWrite: false
        })
      );
      atm.renderOrder = 3;
      grp.add(atm);
    }

    ctx.registerFocus({
      name: opts.id, label: opts.label, radius: opts.R, parent: 'sun',
      minAlt: Math.max(opts.R * 0.006, 3e-4),
      getPosition: function () { return center; }
    });
    if (COSMOS.registerDestination) {
      COSMOS.registerDestination({
        id: opts.id, label: '▸ ' + opts.label, category: opts.category,
        focus: opts.id, radiusMult: 3.4, note: opts.note,
        order: opts.order !== undefined ? opts.order : 1, blurb: opts.blurb
      });
    }

    var dotTex = getDotTex(THREE);
    var markers = [];
    (opts.markers || []).forEach(function (mk) {
      var rr = opts.R * (1 + Math.max(mk.alt || 0, 0.004));
      var local = latLonToVec3(mk.lat, mk.lon, 1, new THREE.Vector3());
      var localPos = local.clone().multiplyScalar(rr);
      var pos = localPos.clone().add(center);

      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mk.tex || dotTex, color: new THREE.Color(mk.color || '#ffffff'),
        transparent: true, depthWrite: false,
        blending: mk.tex ? THREE.AdditiveBlending : THREE.NormalBlending
      }));
      sp.position.copy(localPos);
      var s = mk.size || opts.R * 0.034;
      sp.scale.set(s, s * (mk.tall ? 2 : 1), 1);
      sp.renderOrder = 4;
      grp.add(sp);

      var fname = opts.id + '_' + mk.id;
      ctx.registerFocus({
        name: fname, label: mk.name, radius: Math.max(opts.R * 0.03, 0.02),
        parent: opts.id, minAlt: 4e-4,
        getPosition: (function (p) { return function () { return p; }; })(pos)
      });
      if (mk.atlas && COSMOS.registerDestination) {
        COSMOS.registerDestination({
          id: fname, label: mk.name, category: opts.category, focus: fname,
          radiusMult: 3.2, note: mk.note, order: mk.order, blurb: mk.blurb
        });
      }
      markers.push({ mk: mk, fname: fname, local: local, localPos: localPos, pos: pos, label: null });
    });

    // labels (proximity + facing gated) and one-time arrival lore
    var camToC = new THREE.Vector3();
    var scr = { x: 0, y: 0, front: false, dist: 0 };
    var told = {};
    ctx.onUpdate(function (dt, state) {
      var fn = state.focusName;
      if (fn === opts.id && !told[fn] && opts.blurb) {
        told[fn] = true;
        ctx.toast(opts.label + ' — ' + opts.blurb, 8500);
      } else if (fn && fn.indexOf(opts.id + '_') === 0 && !told[fn]) {
        told[fn] = true;
        for (var q = 0; q < markers.length; q++) {
          if (markers[q].fname === fn) {
            if (markers[q].mk.blurb) ctx.toast(markers[q].mk.name + ' — ' + markers[q].mk.blurb, 8500);
            break;
          }
        }
      }

      camToC.copy(state.camPos).sub(center);
      var dC = camToC.length();
      var near = dC < opts.R * 26 && state.labelsVisible;
      var W = ctx.renderer.domElement.clientWidth, Hh = ctx.renderer.domElement.clientHeight;
      if (dC > 0) camToC.multiplyScalar(1 / dC);
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (!near) { if (m.label) m.label.visible = false; continue; }
        if (m.local.dot(camToC) < 0.12) { if (m.label) m.label.visible = false; continue; }
        ctx.projectToScreen(m.pos, scr);
        if (!scr.front || scr.x < 24 || scr.x > W - 24 || scr.y < 40 || scr.y > Hh - 96) {
          if (m.label) m.label.visible = false; continue;
        }
        if (!m.label) {
          m.label = ctx.makeTextSprite(m.mk.name, { fontPx: 34, color: m.mk.labelColor || '#eaf1ff' });
          m.label.position.copy(m.localPos).multiplyScalar(1.02);
          grp.add(m.label);
        }
        m.label.visible = true;
        var hw = 13 / state.pixelsPerUnit(scr.dist);
        m.label.scale.set(hw * m.label.userData.aspect, hw, 1);
      }
    });

    return { group: grp, center: center, markers: markers };
  };
})();
