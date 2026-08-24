/**
 * Génère les animations Lottie de la page d'accueil.
 *
 * Choix : les fichiers sont produits ici et versionnés dans le dépôt plutôt
 * que chargés depuis LottieFiles. L'application reste fonctionnelle hors
 * ligne, ne dépend d'aucun service tiers, et les couleurs suivent la palette
 * du projet. Pour retoucher une animation, modifiez sa recette plus bas puis
 * relancez :  node scripts/build-animations.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'animations');
const FPS = 30;
const DURATION = 90; // 3 secondes
const SIZE = 120;

// --- Helpers de bas niveau -------------------------------------------------

/** '#E63946' -> [0.902, 0.224, 0.275, 1] (Lottie attend du 0–1). */
function rgba(hex, alpha = 1) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
    alpha,
  ];
}

const EASE_IN = { x: [0.6], y: [0] };
const EASE_OUT = { x: [0.35], y: [1] };

const still = (k) => ({ a: 0, k });

/**
 * Propriété animée. `frames` est une liste de [frame, valeur].
 * La dernière image ne porte pas d'interpolation : elle clôt la courbe.
 */
function animated(frames) {
  const keyframes = frames.map(([t, value], index) => {
    const s = Array.isArray(value) ? value : [value];
    if (index === frames.length - 1) return { t, s };
    return { t, s, i: EASE_OUT, o: EASE_IN };
  });
  return { a: 1, k: keyframes };
}

/** Transform d'un groupe de formes. */
function transform({ p = [0, 0], a = [0, 0], s = [100, 100], r = 0, o = 100 } = {}) {
  const wrap = (v) => (v && v.a !== undefined ? v : still(v));
  return { ty: 'tr', p: wrap(p), a: wrap(a), s: wrap(s), r: wrap(r), o: wrap(o), nm: 'tr' };
}

const ellipse = (size, position = [0, 0]) => ({
  ty: 'el',
  d: 1,
  s: still(size),
  p: still(position),
  nm: 'ellipse',
});

const roundedRect = (size, position = [0, 0], cornerRadius = 4) => ({
  ty: 'rc',
  d: 1,
  s: still(size),
  p: still(position),
  r: still(cornerRadius),
  nm: 'rect',
});

/** Tracé libre (utilisé pour la coche de validation). */
const bezier = (points, closed = false) => ({
  ty: 'sh',
  d: 1,
  ks: still({
    i: points.map(() => [0, 0]),
    o: points.map(() => [0, 0]),
    v: points,
    c: closed,
  }),
  nm: 'path',
});

const fill = (hex, alpha = 1) => ({
  ty: 'fl',
  c: still(rgba(hex)),
  o: still(alpha * 100),
  r: 1,
  bm: 0,
  nm: 'fill',
});

const stroke = (hex, width, alpha = 1) => ({
  ty: 'st',
  c: still(rgba(hex)),
  o: still(alpha * 100),
  w: still(width),
  lc: 2, // extrémités arrondies
  lj: 2, // jonctions arrondies
  bm: 0,
  nm: 'stroke',
});

/** Révèle progressivement un tracé (effet « qui se dessine »). */
const trim = (endProp) => ({
  ty: 'tm',
  s: still(0),
  e: endProp,
  o: still(0),
  m: 1,
  nm: 'trim',
});

const group = (items, name = 'group') => ({ ty: 'gr', it: items, nm: name, bm: 0, hd: false });

let layerIndex = 0;
function layer(shapes, { position = [SIZE / 2, SIZE / 2], scale = [100, 100], rotation = 0, opacity = 100, name = 'layer' } = {}) {
  const wrap = (v) => (v && v.a !== undefined ? v : still(v));
  layerIndex += 1;
  return {
    ddd: 0,
    ind: layerIndex,
    ty: 4, // shape layer
    nm: name,
    sr: 1,
    ks: {
      o: wrap(opacity),
      r: wrap(rotation),
      p: wrap(Array.isArray(position) ? [...position, 0] : position),
      a: still([0, 0, 0]),
      s: wrap(Array.isArray(scale) ? [...scale, 100] : scale),
    },
    ao: 0,
    shapes,
    ip: 0,
    op: DURATION,
    st: 0,
    bm: 0,
  };
}

function composition(name, layers) {
  layerIndex = 0;
  return {
    v: '5.9.0',
    fr: FPS,
    ip: 0,
    op: DURATION,
    w: SIZE,
    h: SIZE,
    nm: name,
    ddd: 0,
    assets: [],
    layers,
  };
}

// --- Recettes des animations ----------------------------------------------

/** Étape 1 — un formulaire dont les lignes se remplissent une à une. */
function buildSignup(color) {
  layerIndex = 0;
  const lines = [-14, 0, 14].map((y, i) => {
    const start = 4 + i * 7;
    return layer(
      [
        group(
          [
            roundedRect([44, 6], [0, 0], 3),
            fill(color, 0.85),
            transform({
              // La ligne se remplit depuis la gauche : ancrage à gauche.
              a: [-22, 0],
              p: [-22, 0],
              s: animated([
                [0, [0, 100]],
                [start, [0, 100]],
                [start + 12, [100, 100]],
                [DURATION - 8, [100, 100]],
                [DURATION, [0, 100]],
              ]),
            }),
          ],
          `line-${i}`,
        ),
      ],
      { position: [SIZE / 2 - 4, SIZE / 2 + y], name: `line-${i}` },
    );
  });

  const card = layer(
    [group([roundedRect([76, 88], [0, 0], 12), stroke(color, 5, 0.9)], 'card')],
    {
      position: [SIZE / 2, SIZE / 2],
      scale: animated([
        [0, [96, 96]],
        [45, [102, 102]],
        [DURATION, [96, 96]],
      ]),
      name: 'card',
    },
  );

  return composition('signup', [...lines, card]);
}

/** Étape 2 — une coche qui se dessine dans un cercle. */
function buildValidation(color) {
  layerIndex = 0;
  const check = layer(
    [
      group(
        [
          bezier([
            [-17, 2],
            [-5, 14],
            [18, -13],
          ]),
          stroke(color, 8),
          trim(
            animated([
              [0, 0],
              [6, 0],
              [28, 100],
              [DURATION - 10, 100],
              [DURATION, 100],
            ]),
          ),
          transform(),
        ],
        'check',
      ),
    ],
    { name: 'check' },
  );

  const ring = layer(
    [group([ellipse([80, 80]), stroke(color, 5, 0.9), transform()], 'ring')],
    {
      scale: animated([
        [0, [70, 70]],
        [16, [104, 104]],
        [30, [100, 100]],
        [DURATION, [100, 100]],
      ]),
      opacity: animated([
        [0, 0],
        [12, 100],
        [DURATION, 100],
      ]),
      name: 'ring',
    },
  );

  const halo = layer(
    [group([ellipse([80, 80]), fill(color, 1), transform()], 'halo')],
    {
      scale: animated([
        [30, [100, 100]],
        [60, [145, 145]],
        [DURATION, [145, 145]],
      ]),
      opacity: animated([
        [30, 22],
        [60, 0],
        [DURATION, 0],
      ]),
      name: 'halo',
    },
  );

  return composition('validation', [check, ring, halo]);
}

/** Étape 3 — un histogramme dont les barres montent. */
function buildDashboard(color) {
  layerIndex = 0;
  const heights = [30, 50, 40];
  const bars = heights.map((height, i) => {
    const start = 4 + i * 6;
    return layer(
      [
        group(
          [
            roundedRect([16, height], [0, 0], 6),
            fill(color, i === 1 ? 1 : 0.55),
            transform({
              // Ancrage en bas pour que la barre pousse vers le haut.
              a: [0, height / 2],
              p: [0, height / 2],
              s: animated([
                [0, [100, 0]],
                [start, [100, 0]],
                [start + 14, [100, 100]],
                [DURATION - 8, [100, 100]],
                [DURATION, [100, 0]],
              ]),
            }),
          ],
          `bar-${i}`,
        ),
      ],
      { position: [SIZE / 2 - 22 + i * 22, SIZE / 2 + 26], name: `bar-${i}` },
    );
  });

  const baseline = layer(
    [group([roundedRect([72, 5], [0, 0], 3), fill(color, 0.9), transform()], 'base')],
    { position: [SIZE / 2, SIZE / 2 + 30], name: 'baseline' },
  );

  return composition('dashboard', [...bars, baseline]);
}

/** Caisse — des pièces qui tombent dans la pile. */
function buildCash(color) {
  layerIndex = 0;
  const stack = [0, 1, 2].map((i) =>
    layer(
      [
        group(
          [ellipse([54, 16]), fill(color, 0.35 + i * 0.2), transform()],
          `coin-${i}`,
        ),
      ],
      { position: [SIZE / 2, SIZE / 2 + 30 - i * 13], name: `stack-${i}` },
    ),
  );

  const falling = layer(
    [group([ellipse([54, 16]), fill(color, 1), transform()], 'coin-fall')],
    {
      position: animated([
        [0, [SIZE / 2, 4, 0]],
        [20, [SIZE / 2, SIZE / 2 - 9, 0]],
        [28, [SIZE / 2, SIZE / 2 - 5, 0]],
        [DURATION - 8, [SIZE / 2, SIZE / 2 - 5, 0]],
        [DURATION, [SIZE / 2, 4, 0]],
      ]),
      opacity: animated([
        [0, 0],
        [10, 100],
        [DURATION - 10, 100],
        [DURATION, 0],
      ]),
      scale: animated([
        [0, [88, 88]],
        [20, [100, 100]],
        [26, [108, 88]],
        [32, [100, 100]],
        [DURATION, [100, 100]],
      ]),
      name: 'falling',
    },
  );

  return composition('cash', [falling, ...stack]);
}

/** Stock — des cartons qui s'empilent. */
function buildStock(color) {
  layerIndex = 0;
  const boxes = [0, 1, 2].map((i) => {
    const start = 3 + i * 7;
    return layer(
      [
        group(
          [roundedRect([46, 24], [0, 0], 6), fill(color, 0.45 + i * 0.25), transform()],
          `box-${i}`,
        ),
      ],
      {
        position: animated([
          [0, [SIZE / 2, SIZE / 2 + 28 - i * 26, 0]],
          [start, [SIZE / 2, SIZE / 2 + 28 - i * 26 - 40, 0]],
          [start + 12, [SIZE / 2, SIZE / 2 + 28 - i * 26, 0]],
          [DURATION, [SIZE / 2, SIZE / 2 + 28 - i * 26, 0]],
        ]),
        opacity: animated([
          [0, 0],
          [start, 0],
          [start + 8, 100],
          [DURATION, 100],
        ]),
        name: `box-${i}`,
      },
    );
  });

  return composition('stock', boxes);
}

/** Menu — une cloche qui se soulève au-dessus de l'assiette. */
function buildMenu(color) {
  layerIndex = 0;

  const steam = [-14, 0, 14].map((x, i) =>
    layer(
      [group([roundedRect([5, 16], [0, 0], 3), fill(color, 0.55), transform()], `steam-${i}`)],
      {
        position: animated([
          [0, [SIZE / 2 + x, 34, 0]],
          [DURATION, [SIZE / 2 + x, 12, 0]],
        ]),
        opacity: animated([
          [0, 0],
          [20 + i * 8, 70],
          [DURATION - 8, 0],
          [DURATION, 0],
        ]),
        name: `steam-${i}`,
      },
    ),
  );

  const dome = layer(
    [
      group(
        [
          // Demi-cercle : l'assiette masque la moitié basse.
          ellipse([62, 62], [0, 0]),
          fill(color, 1),
          transform(),
        ],
        'dome',
      ),
    ],
    {
      position: animated([
        [0, [SIZE / 2, SIZE / 2 + 14, 0]],
        [40, [SIZE / 2, SIZE / 2 + 2, 0]],
        [DURATION, [SIZE / 2, SIZE / 2 + 14, 0]],
      ]),
      name: 'dome',
    },
  );

  const plate = layer(
    [group([roundedRect([88, 12], [0, 0], 6), fill(color, 0.85), transform()], 'plate')],
    { position: [SIZE / 2, SIZE / 2 + 30], name: 'plate' },
  );

  // La cloche est dessinée avant l'assiette pour que celle-ci la recouvre.
  return composition('menu', [...steam, dome, plate]);
}

/** Crédit — une horloge dont les aiguilles tournent. */
function buildCredit(color) {
  layerIndex = 0;

  const minuteHand = layer(
    [
      group(
        [
          roundedRect([5, 30], [0, 0], 3),
          fill(color, 1),
          transform({ a: [0, 15], p: [0, 15] }),
        ],
        'minute',
      ),
    ],
    {
      position: [SIZE / 2, SIZE / 2],
      rotation: animated([
        [0, 0],
        [DURATION, 360],
      ]),
      name: 'minute-hand',
    },
  );

  const hourHand = layer(
    [
      group(
        [
          roundedRect([5, 20], [0, 0], 3),
          fill(color, 0.6),
          transform({ a: [0, 10], p: [0, 10] }),
        ],
        'hour',
      ),
    ],
    {
      position: [SIZE / 2, SIZE / 2],
      rotation: animated([
        [0, 0],
        [DURATION, 90],
      ]),
      name: 'hour-hand',
    },
  );

  const dial = layer(
    [group([ellipse([84, 84]), stroke(color, 5, 0.9), transform()], 'dial')],
    {
      scale: animated([
        [0, [98, 98]],
        [45, [103, 103]],
        [DURATION, [98, 98]],
      ]),
      name: 'dial',
    },
  );

  const pin = layer(
    [group([ellipse([10, 10]), fill(color, 1), transform()], 'pin')],
    { name: 'pin' },
  );

  return composition('credit', [pin, minuteHand, hourHand, dial]);
}

/** Personnel — trois silhouettes qui apparaissent l'une après l'autre. */
function buildStaff(color) {
  layerIndex = 0;

  const people = [-26, 0, 26].map((x, i) => {
    const start = 3 + i * 6;
    const isCenter = i === 1;
    const opacity = isCenter ? 1 : 0.5;
    return layer(
      [
        group([ellipse([22, 22], [0, -14]), fill(color, opacity), transform()], `head-${i}`),
        group(
          [roundedRect([38, 26], [0, 10], 12), fill(color, opacity), transform()],
          `body-${i}`,
        ),
      ],
      {
        position: [SIZE / 2 + x, SIZE / 2 + (isCenter ? 0 : 6)],
        scale: animated([
          [0, [0, 0]],
          [start, [0, 0]],
          [start + 10, [108, 108]],
          [start + 14, [100, 100]],
          [DURATION - 6, [100, 100]],
          [DURATION, [0, 0]],
        ]),
        name: `person-${i}`,
      },
    );
  });

  // Les silhouettes latérales passent derrière celle du centre.
  return composition('staff', [people[0], people[2], people[1]]);
}

// --- Écriture --------------------------------------------------------------

const RECIPES = {
  signup: () => buildSignup('#E63946'),
  validation: () => buildValidation('#2E9E5B'),
  dashboard: () => buildDashboard('#3A6FD8'),
  cash: () => buildCash('#2E9E5B'),
  stock: () => buildStock('#E08A1E'),
  menu: () => buildMenu('#E63946'),
  credit: () => buildCredit('#7A5AF8'),
  staff: () => buildStaff('#3A6FD8'),
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, build] of Object.entries(RECIPES)) {
  const json = build();
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(json));
  const size = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`${name}.json — ${json.layers.length} calques, ${size} Ko`);
}

console.log(`\n${Object.keys(RECIPES).length} animations écrites dans assets/animations/`);
