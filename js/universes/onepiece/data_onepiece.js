/* data_onepiece.js — canonical geography of the One Piece world (the "Blue
   Planet"), sourced from the One Piece Wiki (Paradise / New World / Grand Line
   / Red Line / East Blue entries). Single source of truth consumed by
   mod_onepiece.js to paint the map texture AND place island markers.

   COORDINATE MODEL (faithful to canon topology; exact degrees are schematic
   since Oda never published a true-scale map):
     - The RED LINE is the great circle at longitude 0deg & 180deg (a vertical
       ring). The GRAND LINE is the equator (lat 0), perpendicular to it.
     - They cross at exactly two points: REVERSE MOUNTAIN (0,0), the Grand Line
       entrance where all four seas' currents converge, and MARY GEOISE /
       FISH-MAN ISLAND (0,180) on the far side.
     - PARADISE = the equator from lon 0 -> 180 (islands placed by story order).
       Dive under the Red Line at (0,180) to FISH-MAN ISLAND, then the NEW WORLD
       continues the equator from lon 180 -> 360 back toward Laugh Tale.
     - The four Blues fill the four quadrants around Reverse Mountain. */
(function () {
  'use strict';

  window.ONEPIECE = {
    R: 1.6,                                   // ocean world, larger than Earth
    center: [34000, 2600, 46000],            // a hidden world, reachable via the Atlas

    // four seas are defined after this object literal (see bottom of file)
    seas: [],

    // landmarks that are not "islands" but define the map
    landmarks: [
      { id: 'redline',   name: 'The Red Line',    kind: 'redline' },
      { id: 'grandline', name: 'The Grand Line',  kind: 'grandline' }
    ],

    /* islands: id, name, lat, lon (deg, lon in 0..360 route space),
       alt (fraction of R above/below surface, default 0), half, color (land),
       blurb, landmark, atlas (show in Atlas menu), cluster (draw as archipelago) */
    islands: [
      /* ---- EAST BLUE (origin sea; south-east quadrant) ---- */
      { id: 'dawn',       name: 'Dawn Island',      lat: -30, lon: 20, half: 'East Blue', color: '#5f8f4e', atlas: true,
        blurb: "Foosha Village on Dawn Island — Luffy's hometown, where Shanks left him the straw hat. Here the greatest adventure began.", landmark: 'Goa Kingdom / Mt. Corvo' },
      { id: 'shells',     name: 'Shells Town',      lat: -22, lon: 28, half: 'East Blue', color: '#6f9a55',
        blurb: 'A Marine base town where Luffy freed the bound swordsman Roronoa Zoro — his first crewmate.', landmark: 'Marine 153rd Branch' },
      { id: 'orange',     name: 'Orange Town',      lat: -16, lon: 23, half: 'East Blue', color: '#7a9a55',
        blurb: "Buggy the Clown's turf, where the thief Nami first crosses paths with the Straw Hats.", landmark: "Buggy's Big Top" },
      { id: 'syrup',      name: 'Syrup Village',    lat: -25, lon: 12, half: 'East Blue', color: '#6f9a55',
        blurb: "Usopp's home. The crew earns their first ship, the Going Merry, from Kaya.", landmark: "Kaya's mansion" },
      { id: 'baratie',    name: 'Baratie',          lat: -12, lon: 8,  half: 'East Blue', color: '#8a7d5a',
        blurb: 'The floating sea restaurant where the cook Sanji joins — and Zoro meets the Warlord Mihawk.', landmark: 'The fish-shaped restaurant' },
      { id: 'arlong',     name: 'Arlong Park',      lat: -18, lon: 33, half: 'East Blue', color: '#5f8f4e',
        blurb: "Nami's home village, oppressed by the fish-man Arlong until Luffy tears his tower down.", landmark: 'Cocoyasi Village' },
      { id: 'loguetown',  name: 'Loguetown',        lat: -4,  lon: 4,  half: 'East Blue', color: '#8f9099', atlas: true,
        blurb: 'The Town of the Beginning and the End — birth and execution place of the Pirate King, Gold Roger. Last stop before the Grand Line.', landmark: 'Execution platform' },

      /* ---- PARADISE (Grand Line, first half; equator lon 0..180) ---- */
      { id: 'reverse',    name: 'Reverse Mountain',  lat: 0,  lon: 0.5, half: 'Paradise', color: '#b06a4a', atlas: true,
        blurb: 'The only sane entrance to the Grand Line — a mountain where currents from all four seas flow upward, then plunge into the Grand Line.', landmark: 'Four-sea canal summit' },
      { id: 'twincape',   name: 'Twin Cape',         lat: 2,  lon: 5,   half: 'Paradise', color: '#7a9a55',
        blurb: 'Home of the lighthouse keeper Crocus and the island-sized whale Laboon, forever waiting for his crew.', landmark: 'Twin Cape lighthouse' },
      { id: 'whiskey',    name: 'Whisky Peak',       lat: -3, lon: 16,  half: 'Paradise', color: '#6f9a55',
        blurb: 'A town of cactus-shaped peaks whose friendly welcomers are secretly Baroque Works bounty hunters.', landmark: 'Cactus rock peaks' },
      { id: 'littlegarden', name: 'Little Garden',   lat: 4,  lon: 32,  half: 'Paradise', color: '#4f7a3e',
        blurb: 'A prehistoric island frozen in an age of dinosaurs and dueling giants, Dorry and Brogy.', landmark: 'Primeval jungle & volcanoes' },
      { id: 'drum',       name: 'Drum Island',       lat: 9,  lon: 50,  half: 'Paradise', color: '#dfe9f2', atlas: true,
        blurb: 'A snowbound winter island where the reindeer doctor Tony Tony Chopper joins the crew.', landmark: 'The Drum Rockies' },
      { id: 'alabasta',   name: 'Alabasta',          lat: -4, lon: 68,  half: 'Paradise', color: '#c9a15a', atlas: true,
        blurb: 'A vast desert kingdom torn by civil war engineered by the Warlord Crocodile. Here Nico Robin first appears.', landmark: 'Alubarna / Rainbase' },
      { id: 'jaya',       name: 'Jaya',              lat: 3,  lon: 86,  half: 'Paradise', color: '#5f8f4e',
        blurb: 'A half-skull island whose other half was blasted into the sky centuries ago — the gateway to Skypiea.', landmark: 'Mock Town' },
      { id: 'skypiea',    name: 'Skypiea',           lat: 3,  lon: 86, alt: 0.34, half: 'Paradise', color: '#eaf1ff', atlas: true,
        blurb: 'A sky island 10,000 metres above the sea, reached by the vertical Knock-Up Stream. Ruled by the "god" Enel.', landmark: 'Upper Yard / the golden bell' },
      { id: 'longring',   name: 'Long Ring Long Land', lat: -2, lon: 108, half: 'Paradise', color: '#7a9a55',
        blurb: 'A stretched island of the Davy Back Fight, where Admiral Aokiji first confronts Luffy.', landmark: 'Elongated terrain' },
      { id: 'water7',     name: 'Water 7',           lat: 3,  lon: 126, half: 'Paradise', color: '#7fa0c0', atlas: true,
        blurb: 'The City of Water, home of master shipwrights. The cyborg Franky joins and the Thousand Sunny is born.', landmark: 'Galley-La / the sea train' },
      { id: 'enieslobby', name: 'Enies Lobby',       lat: -3, lon: 137, half: 'Paradise', color: '#9098a6',
        blurb: "The government's judicial island. The Straw Hats burn the flag of the World Government to rescue Robin.", landmark: 'The Gates of Justice' },
      { id: 'thriller',   name: 'Thriller Bark',     lat: 2,  lon: 155, half: 'Paradise', color: '#4a3f5a', atlas: true,
        blurb: 'A gigantic haunted ship-island adrift in the Florian Triangle, where the skeleton musician Brook joins.', landmark: 'The Florian Triangle' },
      { id: 'sabaody',    name: 'Sabaody Archipelago', lat: 2, lon: 172, half: 'Paradise', color: '#6f9a55', atlas: true, cluster: true,
        blurb: 'Seventy-nine mangrove groves at the foot of the Red Line. Ships are coated here for the deep dive — and the crew is scattered across the world.', landmark: '79 mangrove groves' },

      /* ---- MARY GEOISE + FISH-MAN ISLAND (the Red Line crossing) ---- */
      { id: 'marygeoise', name: 'Mary Geoise',       lat: 6,  lon: 179, alt: 0.06, half: 'Red Line', color: '#e8e0c8', atlas: true,
        blurb: 'The Holy Land atop the Red Line — seat of the World Government and the Five Elders, 10,000 metres above the sea.', landmark: 'Pangaea Castle' },
      { id: 'fishman',    name: 'Fish-Man Island',   lat: 0,  lon: 180, alt: -0.16, half: 'Transition', color: '#59b0c9', atlas: true,
        blurb: 'The Ryugu Kingdom, 10,000 metres deep in a bubble beneath the Red Line — the only passage from Paradise into the New World.', landmark: 'Ryugu Palace' },

      /* ---- NEW WORLD (Grand Line, second half; equator lon 180..360) ---- */
      { id: 'punkhazard', name: 'Punk Hazard',       lat: 0,  lon: 191, half: 'New World', color: '#b5605a', atlas: true,
        blurb: 'The first New World island — one half burning, one half frozen, littered with the fallout of an admiral duel. Alliance with Law is forged.', landmark: "Caesar's weapons lab" },
      { id: 'dressrosa',  name: 'Dressrosa',         lat: -3, lon: 209, half: 'New World', color: '#c96a7a', atlas: true,
        blurb: "The kingdom of the Warlord Doflamingo, of living toys and a colosseum. Luffy debuts Gear Fourth.", landmark: 'Corrida Colosseum' },
      { id: 'zou',        name: 'Zou',               lat: 4,  lon: 227, half: 'New World', color: '#5f8f6e',
        blurb: 'A living island on the back of the millennium-old elephant Zunesha, home of the Mink Tribe. (It walks the seas.)', landmark: 'Zunesha / Kurau City' },
      { id: 'wholecake',  name: 'Whole Cake Island', lat: 3,  lon: 245, half: 'New World', color: '#d98fb0', atlas: true, cluster: true,
        blurb: 'The dessert-themed seat of the Emperor Big Mom — thirty-four islands of cake, candy and terror.', landmark: 'Whole Cake Chateau' },
      { id: 'wano',       name: 'Wano Country',      lat: 6,  lon: 270, half: 'New World', color: '#c85a6a', atlas: true,
        blurb: 'An isolated samurai land sealed behind waterfalls. On Onigashima, Luffy awakens Gear Fifth and the Emperor Kaido falls.', landmark: 'Onigashima' },
      { id: 'egghead',    name: 'Egghead Island',    lat: -2, lon: 299, half: 'New World', color: '#8fbfd0', atlas: true,
        blurb: 'The Island of the Future — Dr. Vegapunk’s laboratory of impossible technology and world-shaking secrets.', landmark: 'Labophase / Seraphim' },
      { id: 'elbaf',      name: 'Elbaf',             lat: 5,  lon: 328, half: 'New World', color: '#6f9a55',
        blurb: 'The long-foreshadowed homeland of the giants — a village of warriors from the deepest legends of the sea.', landmark: "Warriors' village" },
      { id: 'laughtale',  name: 'Laugh Tale',        lat: 0,  lon: 354, half: 'New World', color: '#e8c86a', atlas: true,
        blurb: 'The last island of the Grand Line, reachable only with all four Road Poneglyphs. Where Roger left the One Piece.', landmark: "The end of the journey" }
    ]
  };

  // fix the sea list (kept minimal + clean)
  window.ONEPIECE.seas = [
    { name: 'East Blue',  lat: -34, lon: 34,  tint: '#0e3f79' },
    { name: 'North Blue', lat: 36,  lon: 52,  tint: '#123a70' },
    { name: 'West Blue',  lat: 36,  lon: -56, tint: '#0e3566' },
    { name: 'South Blue', lat: -36, lon: -56, tint: '#0c2f5e' }
  ];
})();
