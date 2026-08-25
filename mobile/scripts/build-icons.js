/**
 * Génère les icônes de l'application à partir du logo N'ma.
 *
 *   node scripts/build-icons.js
 *
 * Trois formats, trois contraintes différentes :
 *   • icon.png          — iOS refuse la transparence et rogne les angles
 *                         lui-même : fond plein, logo centré avec marge.
 *   • adaptive-icon.png — Android rogne l'icône selon la forme choisie par
 *                         le constructeur ; seuls les deux tiers centraux
 *                         sont garantis visibles, d'où la marge large.
 *   • favicon / PWA     — affichées très petit : le logo occupe presque
 *                         toute la surface pour rester reconnaissable.
 *
 * Le script est idempotent et n'est relancé qu'en cas de changement de logo.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'logo-nma.png');
const ASSETS = path.join(ROOT, 'assets');

/** Fond de la marque, repris de theme/colors.ts. */
const BACKGROUND = { r: 250, g: 250, b: 250, alpha: 1 };

/**
 * L'emblème seul — la cloche et le bol — découpé dans le logo complet.
 *
 * Le logo entier est très allongé : réduit à 60 points sur un écran
 * d'accueil, le mot « Restaurant » devient une tache grise illisible.
 * L'emblème est presque carré et reste reconnaissable à cette taille.
 * Coordonnées relevées sur logo-nma.png (900 × 465).
 */
const EMBLEM = { left: 668, top: 15, width: 232, height: 405 };

/**
 * Pose une image au centre d'un carré, à l'échelle demandée.
 * `ratio` est la part de la largeur totale qu'elle occupe.
 */
async function compose({ size, ratio, background, output, emblem = true }) {
  const inner = Math.round(size * ratio);

  const base = sharp(SOURCE);
  if (emblem) base.extract(EMBLEM);

  const logo = await base
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(output);

  const { size: bytes } = fs.statSync(output);
  console.log(`  ${path.basename(output)}  ${size}×${size}  ${(bytes / 1024).toFixed(1)} ko`);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Logo introuvable : ${SOURCE}`);
    process.exit(1);
  }

  console.log('Génération des icônes à partir du logo N’ma :');

  // iOS et l'écran d'accueil : fond plein, marge confortable.
  await compose({
    size: 1024,
    ratio: 0.72,
    background: BACKGROUND,
    output: path.join(ASSETS, 'icon.png'),
  });

  // Android : la zone sûre ne couvre que 66 % du carré.
  await compose({
    size: 1024,
    ratio: 0.55,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    output: path.join(ASSETS, 'adaptive-icon.png'),
  });

  // Écran de démarrage : ici la place ne manque pas, on montre le logo
  // complet, mot compris.
  await compose({
    size: 1024,
    ratio: 0.9,
    emblem: false,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    output: path.join(ASSETS, 'splash-icon.png'),
  });

  // Onglet du navigateur.
  await compose({
    size: 196,
    ratio: 0.9,
    background: BACKGROUND,
    output: path.join(ASSETS, 'favicon.png'),
  });

  // Icônes de l'application installée depuis le navigateur. Elles vont
  // dans public/, dont Expo recopie le contenu tel quel à l'export web.
  const PUBLIC = path.join(ROOT, 'public');
  fs.mkdirSync(PUBLIC, { recursive: true });

  for (const size of [192, 512]) {
    await compose({
      size,
      ratio: 0.78,
      background: BACKGROUND,
      output: path.join(PUBLIC, `icon-${size}.png`),
    });
  }

  /*
   * Version « maskable » : Android rogne librement l'icône installée
   * (cercle, goutte, carré arrondi). Le logo est donc réduit à la zone
   * sûre — 80 % du carré — et le fond couvre toute la surface, sans quoi
   * l'emblème serait amputé sur certains téléphones.
   */
  await compose({
    size: 512,
    ratio: 0.52,
    background: BACKGROUND,
    output: path.join(PUBLIC, 'icon-maskable-512.png'),
  });

  console.log('Terminé.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
