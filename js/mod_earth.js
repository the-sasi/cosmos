/* mod_earth.js — the hero object: tilted, spinning Earth with day/night city
   lights, a drifting cloud shell and a thin fresnel atmosphere rim. Publishes
   ctx.shared.earthSurface (the spinning group) for mod_monuments. */
(function () {
  'use strict';

  COSMOS.register('earth', function (ctx) {
    var THREE = ctx.THREE;
    var A = ctx.assets || {};
    var high = ctx.quality.tier === 'high';
    var LP = ctx.layout.PLANETS.earth;
    var R = LP.radius; // 1 world unit by definition

    /* ---- group hierarchy: tiltGroup (axial tilt) -> spinGroup (day spin) ---- */
    var tiltGroup = new THREE.Group();
    tiltGroup.name = 'earthTilt';
    tiltGroup.rotation.z = LP.tilt * Math.PI / 180;
    tiltGroup.position.copy(ctx.eph.earth);

    var spinGroup = new THREE.Group();
    spinGroup.name = 'earthSurface';
    tiltGroup.add(spinGroup);
    ctx.world.add(tiltGroup);

    // Published at build time — mod_monuments parents ground-glued objects here.
    ctx.shared.earthSurface = spinGroup;

    /* ---- shared uniforms (updated per frame, shared across materials) ---- */
    var uSunDir = { value: new THREE.Vector3(1, 0, 0) }; // world-space, earth -> sun
    var uAtmoFade = { value: 1.0 };                       // damps sky glow when inside it
    var uDetail = { value: 0.0 };                         // close-range surface detail fade

    /* =========================================================================
       Earth sphere — MeshPhongMaterial (log depth + sun lighting for free)
       + onBeforeCompile: night-side city lights and a warm terminator band.
       ====================================================================== */
    var earthGeo = new THREE.SphereGeometry(R, high ? 96 : 56, high ? 64 : 40);

    var matOpts = {
      specular: new THREE.Color(0x445566),
      shininess: 18
    };
    if (A.earthDay) matOpts.map = A.earthDay;
    else matOpts.color = new THREE.Color(0x2e5277); // graceful fallback: deep ocean blue
    if (A.earthNormal) {
      matOpts.normalMap = A.earthNormal;
      matOpts.normalScale = new THREE.Vector2(0.85, 0.85);
    }
    if (A.earthSpecular) matOpts.specularMap = A.earthSpecular;

    // the close-range detail layer re-tiles this map at uv*13/53/211 — without
    // RepeatWrapping those samples clamp to a single edge texel and the whole
    // feature silently degenerates into a brightness shift
    if (A.earthDay) {
      A.earthDay.wrapS = A.earthDay.wrapT = THREE.RepeatWrapping;
      A.earthDay.needsUpdate = true;
    }

    var earthMat = new THREE.MeshPhongMaterial(matOpts);
    var hasNight = !!A.earthNight;

    earthMat.onBeforeCompile = function (shader) {
      shader.uniforms.uSunDir = uSunDir;
      shader.uniforms.uDetail = uDetail;
      if (hasNight) shader.uniforms.uNightMap = { value: A.earthNight };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\n' +
          'varying vec3 vCosmosWN;\n' +
          'varying vec2 vCosmosUv;')
        .replace('#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\n' +
          // world-space geometric normal (groups carry no scale; w=0 kills translation)
          'vCosmosWN = normalize( vec3( modelMatrix * vec4( objectNormal, 0.0 ) ) );\n' +
          'vCosmosUv = uv;');

      var nightGLSL = hasNight
        ? 'vec3 cosmosCity = texture2D( uNightMap, vCosmosUv ).rgb;\n' +
          // gentle contrast shaping: keep dim sprawl, let cores bloom
          'cosmosCity *= cosmosCity * 0.55 + 0.6;\n' +
          'cosmosCity *= cosmosNightDetail;\n' +
          'float cosmosNightMask = smoothstep( 0.05, -0.15, cosmosSunDot );\n' +
          // warm-orange sodium-lamp tint x1.4, added as emission on the dark side
          'totalEmissiveRadiance += cosmosCity * vec3( 1.4, 1.02, 0.61 ) * cosmosNightMask;\n'
        : '';

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\n' +
          'uniform vec3 uSunDir;\n' +
          'uniform float uDetail;\n' +
          (hasNight ? 'uniform sampler2D uNightMap;\n' : '') +
          'varying vec3 vCosmosWN;\n' +
          'varying vec2 vCosmosUv;')
        .replace('#include <map_fragment>',
          '#include <map_fragment>\n' +
          // close range: re-tile the day map at high frequency as luminance
          // detail, so the surface keeps texture when the 2K map runs out
          'float cosmosNightDetail = 1.0;\n' +
          '#ifdef USE_MAP\n' +
          'if ( uDetail > 0.001 ) {\n' +
          '  float cosmosD1 = dot( texture2D( map, vCosmosUv * 13.0 ).rgb, vec3( 0.333 ) ) - 0.5;\n' +
          '  float cosmosD2 = dot( texture2D( map, vCosmosUv * 53.0 ).rgb, vec3( 0.333 ) ) - 0.5;\n' +
          '  float cosmosD3 = dot( texture2D( map, vCosmosUv * 211.0 ).rgb, vec3( 0.333 ) ) - 0.5;\n' +
          '  diffuseColor.rgb *= 1.0 + ( cosmosD1 * 0.42 + cosmosD2 * 0.28 + cosmosD3 * 0.24 ) * uDetail;\n' +
          // sharper modulation for the night lights: breaks blurred city blobs
          // into granular sprawl when the camera is low
          // gentle: break up blur without extinguishing coastal cities whose
          // underlying day-map luminance is dark (never below 45%)
          '  cosmosNightDetail = clamp( 1.0 + ( cosmosD1 * 0.35 + cosmosD2 * 0.5 + cosmosD3 * 0.45 ) * uDetail, 0.45, 1.7 );\n' +
          '}\n' +
          '#endif')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          'float cosmosSunDot = dot( normalize( vCosmosWN ), uSunDir );\n' +
          nightGLSL)
        .replace('#include <output_fragment>',
          // warm band where the terminator grazes the surface (dot ~ 0)
          'float cosmosTerm = exp( -cosmosSunDot * cosmosSunDot * 40.0 );\n' +
          'outgoingLight = mix( outgoingLight,\n' +
          '  outgoingLight * vec3( 1.22, 0.85, 0.60 ) + vec3( 0.016, 0.007, 0.002 ),\n' +
          '  cosmosTerm * 0.5 );\n' +
          '#include <output_fragment>');
    };
    earthMat.customProgramCacheKey = function () { return 'cosmos-earth-night-v3'; };

    var earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.name = 'earth';
    spinGroup.add(earthMesh);

    /* =========================================================================
       Cloud shell — thin, alpha-from-brightness, drifts ~1.35x the ground rate
       (alphaMap = same texture handles both alpha-PNG and black-background art).
       ====================================================================== */
    var cloudMesh = null;
    if (A.earthClouds) {
      var cloudGeo = new THREE.SphereGeometry(R * 1.008, high ? 64 : 40, high ? 48 : 28);
      var cloudMat = new THREE.MeshLambertMaterial({
        map: A.earthClouds,
        alphaMap: A.earthClouds,
        transparent: true,
        depthWrite: false,
        opacity: 0.96
      });
      cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
      cloudMesh.name = 'earthClouds';
      cloudMesh.renderOrder = 2;
      spinGroup.add(cloudMesh); // rides the ground spin; adds its own extra drift
    }

    /* =========================================================================
       Atmosphere rim — BackSide additive fresnel shell at 3.5% altitude.
       Honest and thin: bright blue haze hugging the limb, warm arc at the
       terminator, near-nothing on the night side, damped when you fly inside.
       ====================================================================== */
    var atmoGeo = new THREE.SphereGeometry(R * 1.035, high ? 64 : 40, high ? 48 : 28);
    var atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: uSunDir,
        uFade: uAtmoFade
      },
      vertexShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_vertex>',
        'varying vec3 vVN;',
        'varying vec3 vVP;',
        'varying vec3 vWN;',
        'void main() {',
        '  vWN = normalize( vec3( modelMatrix * vec4( normal, 0.0 ) ) );',
        '  vVN = normalize( normalMatrix * normal );',
        '  vVP = ( modelViewMatrix * vec4( position, 1.0 ) ).xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '  #include <logdepthbuf_vertex>',
        '}'
      ].join('\n'),
      fragmentShader: [
        '#include <common>',
        '#include <logdepthbuf_pars_fragment>',
        'uniform vec3 uSunDir;',
        'uniform float uFade;',
        'varying vec3 vVN;',
        'varying vec3 vVP;',
        'varying vec3 vWN;',
        'void main() {',
        '  #include <logdepthbuf_fragment>',
        '  vec3 n = normalize( vVN );',
        '  vec3 v = normalize( -vVP );',
        // BackSide: dot(n,v) is 0 at the shell limb, -1 at disc center.
        // The visible annulus outside the planet spans roughly [-0.26, 0]:
        // ramp so glow peaks right at Earth's limb and dies at the shell edge.
        '  float rim = clamp( -dot( n, v ) * 3.9, 0.0, 1.0 );',
        '  float glow = pow( rim, 1.55 );',
        '  float sunN = dot( normalize( vWN ), uSunDir );',
        '  float day = clamp( sunN * 1.7 + 0.5, 0.0, 1.0 );',
        '  day = day * day * 0.95 + 0.05;',
        // deep space-blue at the outer feather -> pale #4d8fd9-family at the limb
        '  vec3 col = mix( vec3( 0.11, 0.27, 0.58 ), vec3( 0.52, 0.74, 1.0 ), glow );',
        // sunset-orange arc where the terminator meets the limb
        '  float term = exp( -sunN * sunN * 30.0 );',
        '  col = mix( col, vec3( 0.98, 0.47, 0.26 ), term * glow * 0.35 );',
        '  float a = glow * day * uFade * 0.85;',
        '  gl_FragColor = vec4( col, a );',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.name = 'earthAtmosphere';
    atmoMesh.renderOrder = 3;
    tiltGroup.add(atmoMesh); // no need to spin a radially-symmetric shell

    /* =========================================================================
       Satellites — 5 tiny additive glow sprites in earth-local orbits.
       Parented to tiltGroup (NOT spinGroup: they must not rotate with the
       ground). Per-sat orbit plane is precomputed as two basis vectors from
       inclination + node; per-frame position = (cos a · e1 + sin a · e2) · r.
       One is a 'station' whose light blinks red-white like a nav beacon.
       ====================================================================== */
    var satTex = (function () {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(230,238,255,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    })();

    var SAT_DEFS = [ // r (Earth radii), inclination/node (rad), phase, period (s)
      { r: 1.10, inc: 0.12, node: 0.0, phase: 0.0, period: 46, px: 3.0, color: 0xe8f0ff },
      { r: 1.18, inc: 0.55, node: 1.9, phase: 2.1, period: 58, px: 3.0, color: 0xdfe8ff },
      { r: 1.28, inc: 0.90, node: 3.7, phase: 4.4, period: 72, px: 3.0, color: 0xf2f4ff },
      { r: 1.38, inc: 1.35, node: 5.2, phase: 1.3, period: 88, px: 3.0, color: 0xe4ecff },
      // the station — bigger, blinking nav light
      { r: 1.06, inc: 0.42, node: 2.8, phase: 5.5, period: 40, px: 4.5, color: 0xffffff, station: true }
    ];

    var sats = [];
    for (var si = 0; si < SAT_DEFS.length; si++) {
      var sd = SAT_DEFS[si];
      var cn = Math.cos(sd.node), sn = Math.sin(sd.node);
      var ci = Math.cos(sd.inc), sii = Math.sin(sd.inc);
      var sMat = new THREE.SpriteMaterial({
        map: satTex,
        color: sd.color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var sSpr = new THREE.Sprite(sMat);
      sSpr.name = 'earthSat' + si;
      sSpr.renderOrder = 4;
      sSpr.visible = false; // gated on camera proximity in onUpdate
      tiltGroup.add(sSpr);
      sats.push({
        sprite: sSpr,
        // orthonormal orbit-plane basis (equatorial node line + inclined normal)
        e1: new THREE.Vector3(cn, 0, -sn),
        e2: new THREE.Vector3(sn * ci, sii, cn * ci),
        r: sd.r,
        angle: sd.phase,
        rate: Math.PI * 2 / sd.period,
        px: sd.px,
        station: !!sd.station,
        blinkOn: -1
      });
    }
    var satsShown = false;

    /* ---- per-frame ------------------------------------------------------- */
    var DAY_SECONDS = 120;                 // one Earth day of animation time
    var spinRate = Math.PI * 2 / DAY_SECONDS;
    var TWO_PI = Math.PI * 2;
    var spinAngle = 3.2;
    var cloudSpin = 0.9;
    var sunDirV = uSunDir.value;
    var camRel = new THREE.Vector3();      // hoisted — no per-frame allocations
    var satTmp = new THREE.Vector3();      // hoisted — satellite world offset

    ctx.onUpdate(function (dt, state) {
      tiltGroup.position.copy(ctx.eph.earth);

      spinAngle += spinRate * dt * state.timeScale;
      if (spinAngle > TWO_PI) spinAngle -= TWO_PI;
      spinGroup.rotation.y = spinAngle;

      if (cloudMesh) {
        // extra 0.35x on top of the parent spin => ~1.35x total drift
        cloudSpin += spinRate * 0.35 * dt * state.timeScale;
        if (cloudSpin > TWO_PI) cloudSpin -= TWO_PI;
        cloudMesh.rotation.y = cloudSpin;
      }

      // world-space sun direction (world group only translates, so logical
      // ephemeris differences ARE world-space directions)
      sunDirV.copy(ctx.eph.sun).sub(ctx.eph.earth).normalize();

      // soften the additive sky when the camera dips inside the atmosphere
      camRel.copy(state.camPos).sub(ctx.eph.earth);
      var f = (camRel.length() - R * 1.02) / (R * 0.33);
      f = f < 0 ? 0 : (f > 1 ? 1 : f);
      uAtmoFade.value = 0.38 + 0.62 * (f * f * (3 - 2 * f));

      // detail noise fades in below ~1,500 km, saturating near the deck —
      // three octaves carry the two extra zoom layers down to ~2 km altitude
      var altE = camRel.length() - R;
      var d = (0.24 - altE) / 0.22;
      uDetail.value = d < 0 ? 0 : (d > 1 ? 1 : d);

      // satellites: sub-pixel beyond ~60 units, so skip the math and hide them
      var satsNear = altE + R < 60;
      if (satsNear !== satsShown) {
        satsShown = satsNear;
        for (var iS = 0; iS < sats.length; iS++) sats[iS].sprite.visible = satsNear;
      }
      if (satsNear) {
        for (var jS = 0; jS < sats.length; jS++) {
          var sat = sats[jS];
          sat.angle += sat.rate * dt * state.timeScale;
          if (sat.angle > TWO_PI) sat.angle -= TWO_PI;
          var caS = Math.cos(sat.angle) * sat.r;
          var saS = Math.sin(sat.angle) * sat.r;
          sat.sprite.position.set(
            sat.e1.x * caS + sat.e2.x * saS,
            sat.e1.y * caS + sat.e2.y * saS,
            sat.e1.z * caS + sat.e2.z * saS
          );
          // screen-constant size: earth-local -> world via the (fixed) axial
          // tilt, then distance against camRel (both earth-relative, logical)
          satTmp.copy(sat.sprite.position).applyQuaternion(tiltGroup.quaternion).sub(camRel);
          var scS = sat.px / state.pixelsPerUnit(Math.max(satTmp.length(), 1e-6));
          sat.sprite.scale.set(scS, scS, 1);
          if (sat.station) {
            // nav-light square wave on raw t (shimmer/blink may ignore timeScale)
            var onS = (state.t % 1.2) < 0.6 ? 1 : 0;
            if (onS !== sat.blinkOn) {
              sat.blinkOn = onS;
              sat.sprite.material.color.setHex(onS ? 0xff6655 : 0xfff4f0);
              sat.sprite.material.opacity = onS ? 1.0 : 0.7;
            }
          }
        }
      }
    });
  });
})();
