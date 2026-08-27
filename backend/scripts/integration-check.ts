/**
 * Contrôle d'intégration sur un compte réel.
 *
 * Se connecte avec de vrais identifiants et interroge, une par une, toutes
 * les routes dont dépend l'espace restaurant. Vérifie que chacune répond,
 * que sa réponse a la forme attendue par l'application, et mesure son temps
 * de réponse — c'est ce dernier point qui détermine la vitesse ressentie,
 * bien plus que le poids du code.
 *
 * Lecture seule : aucune vente, dépense ou fiche n'est créée. Le script est
 * conçu pour être lancé sur l'environnement de production sans rien y
 * laisser.
 *
 *   API_URL=https://... EMAIL=... PASSWORD=... npx tsx scripts/integration-check.ts
 */

const API = process.env.API_URL ?? 'https://n-ma-restaurant.onrender.com';
const EMAIL = process.env.EMAIL ?? '';
const PASSWORD = process.env.PASSWORD ?? '';

interface Probe {
  label: string;
  path: string;
  /** Vérifie que la réponse a bien la forme attendue par l'écran. */
  expect?: (body: any) => boolean;
  /** Route ajoutée récemment : son absence signale un déploiement en retard. */
  since?: string;
}

const PROBES: Probe[] = [
  { label: 'Profil', path: '/api/auth/me', expect: (b) => Boolean(b?.restaurant?.id) },
  { label: 'Paramètres', path: '/api/restaurant', expect: (b) => Boolean(b?.currencyCode) },
  { label: 'Équipe', path: '/api/users', expect: (b) => Array.isArray(b?.items) },

  {
    label: 'Tableau de bord — résumé',
    path: '/api/dashboard/summary',
    expect: (b) => typeof b?.cash?.balance === 'number',
  },
  {
    label: 'Tableau de bord — graphiques',
    path: '/api/dashboard/charts?days=14',
    expect: (b) => Array.isArray(b?.daily) && b.daily.length === 14 && b?.hourly?.length === 24,
    since: 'graphiques',
  },

  { label: 'Caisse — solde', path: '/api/cash/balance', expect: (b) => typeof b?.balance === 'number' },
  {
    label: 'Caisse — mouvements',
    path: '/api/cash/movements?limit=20',
    expect: (b) => Array.isArray(b?.items) && typeof b?.totals?.net === 'number',
  },
  {
    label: 'Caisse — apports',
    path: '/api/cash/movements?category=capital&limit=5',
    expect: (b) => Array.isArray(b?.items),
    since: 'apport de capital',
  },

  {
    label: 'Menu — catégories',
    path: '/api/menu/categories',
    expect: (b) => Array.isArray(b?.items),
  },
  {
    label: 'Menu — plats',
    path: '/api/menu/dishes',
    // `availableQuantity` doit être présent, fût-il nul : c'est ce champ qui
    // porte les portions comptées.
    expect: (b) =>
      Array.isArray(b?.items) &&
      (b.items.length === 0 || 'availableQuantity' in b.items[0]),
    since: 'portions comptées',
  },

  {
    label: 'Ventes — historique',
    path: '/api/sales?limit=20',
    expect: (b) => Array.isArray(b?.items) && typeof b?.totals?.amount === 'number',
  },
  {
    label: 'Ventes — palmarès',
    path: '/api/sales/top-dishes',
    expect: (b) => Array.isArray(b?.items),
  },

  { label: 'Stock', path: '/api/stock', expect: (b) => Array.isArray(b?.items) },
  { label: 'Stock — alertes', path: '/api/stock/alerts', expect: (b) => Array.isArray(b?.items) },
  {
    label: 'Dépenses',
    path: '/api/expenses?limit=20',
    expect: (b) => Array.isArray(b?.items) && typeof b?.totals?.amount === 'number',
  },
  {
    label: 'Créances',
    path: '/api/credits',
    expect: (b) => Array.isArray(b?.items) && typeof b?.totalOutstanding === 'number',
  },
  { label: 'Clients', path: '/api/customers', expect: (b) => Array.isArray(b?.items) },
  { label: 'Personnel', path: '/api/staff', expect: (b) => Array.isArray(b?.items) },
  {
    label: 'Personnel — salaires',
    path: '/api/staff/salaries/overview',
    expect: (b) => typeof b?.totalBalanceDue === 'number',
  },
];

let passed = 0;
let failed = 0;
let missing = 0;

function line(status: '✓' | '✗' | '!', label: string, detail: string): void {
  const color = status === '✓' ? '[32m' : status === '!' ? '[33m' : '[31m';
  console.log(`  ${color}${status}[0m ${label.padEnd(30)} ${detail}`);
}

async function main(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('EMAIL et PASSWORD sont requis.');
    process.exit(1);
  }

  console.log(`\n[1mContrôle d'intégration — ${API}[0m`);
  console.log(`  compte : ${EMAIL}\n`);

  // --- Connexion ---------------------------------------------------------
  const startLogin = Date.now();
  const loginResponse = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginMs = Date.now() - startLogin;
  const login = (await loginResponse.json().catch(() => null)) as any;

  if (!loginResponse.ok || !login?.accessToken) {
    line('✗', 'Connexion', `${loginResponse.status} ${login?.error?.message ?? ''}`);
    console.log('\nImpossible de poursuivre sans session.\n');
    process.exit(1);
  }

  line('✓', 'Connexion', `${loginMs} ms — ${login.profile?.restaurant?.name ?? ''}`);
  passed += 1;
  const token: string = login.accessToken;

  // --- Sondes ------------------------------------------------------------
  console.log('');
  const timings: Array<{ label: string; ms: number }> = [];

  for (const probe of PROBES) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${API}${probe.path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      line('✗', probe.label, `injoignable — ${(error as Error).message}`);
      failed += 1;
      continue;
    }
    const ms = Date.now() - started;
    const body = await response.json().catch(() => null);

    if (response.status === 404 && probe.since) {
      line('!', probe.label, `absente — « ${probe.since} » pas encore déployé`);
      missing += 1;
      continue;
    }

    if (!response.ok) {
      line('✗', probe.label, `${response.status} ${(body as any)?.error?.message ?? ''}`);
      failed += 1;
      continue;
    }

    if (probe.expect && !probe.expect(body)) {
      const hint = probe.since ? ` — « ${probe.since} » pas encore déployé ?` : '';
      line('!', probe.label, `réponse inattendue${hint}`);
      missing += 1;
      continue;
    }

    timings.push({ label: probe.label, ms });
    line('✓', probe.label, `${ms} ms`);
    passed += 1;
  }

  // --- Vitesse -----------------------------------------------------------
  if (timings.length > 0) {
    const sorted = [...timings].sort((a, b) => a.ms - b.ms);
    const total = timings.reduce((sum, t) => sum + t.ms, 0);
    const median = sorted[Math.floor(sorted.length / 2)]?.ms ?? 0;
    const slowest = sorted[sorted.length - 1];

    console.log('\n[1mTemps de réponse[0m');
    console.log(`  médiane          ${median} ms`);
    console.log(`  moyenne          ${Math.round(total / timings.length)} ms`);
    console.log(`  plus lente       ${slowest?.label} — ${slowest?.ms} ms`);

    // L'écran d'accueil déclenche résumé + graphiques en parallèle : son
    // temps d'affichage est celui de la plus lente des deux.
    const home = timings.filter((t) => t.label.startsWith('Tableau de bord'));
    if (home.length === 2) {
      console.log(`  accueil (parallèle) ${Math.max(...home.map((t) => t.ms))} ms`);
    }
  }

  console.log(
    `\n[1m${failed === 0 && missing === 0 ? '[32m' : '[33m'}` +
      `Résultat : ${passed} conformes, ${missing} à déployer, ${failed} en échec[0m\n`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
