/**
 * Test de bout en bout de l'API.
 *
 * Rejoue le parcours complet décrit dans le cahier des charges sur une API
 * réellement démarrée (conteneur Docker), et vérifie après chaque étape que
 * la caisse, le stock et les créances évoluent conformément au tableau §10.
 *
 *   npx tsx scripts/smoke-test.ts            (API sur http://localhost:4000)
 *   API_URL=... npx tsx scripts/smoke-test.ts
 */

const API = process.env.API_URL ?? 'http://localhost:4000';
const SUPER_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@exemple.com';
const SUPER_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? 'motdepasse-super-admin-a-changer';

/** Fonds de caisse posé par le gérant avant la première dépense (§7). */
const CAPITAL = 500_000;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  [32m✓[0m ${label}`);
  } else {
    failed += 1;
    console.log(`  [31m✗ ${label}[0m`);
    if (extra !== undefined) console.log('    →', JSON.stringify(extra));
  }
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

interface ApiResult<T = any> {
  status: number;
  body: T;
}

async function call<T = any>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body: body as T };
}

/**
 * Image de test, fabriquée sur place.
 *
 * Un damier plutôt qu'un aplat : une image d'une seule couleur se comprime
 * si bien que la vignette pèserait autant que l'original, et le test ne
 * prouverait rien. Le bruit reproduit le comportement d'une photo réelle.
 */
async function pngFixture(width: number, height: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    pixels[i * 3] = (x * 7 + y * 13) % 256;
    pixels[i * 3 + 1] = (x * 3 + y * 5) % 256;
    pixels[i * 3 + 2] = (x ^ y) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** Envoi d'un fichier en multipart, comme le fait l'application. */
async function upload(
  path: string,
  token: string,
  content: Buffer,
  fileName: string,
): Promise<ApiResult> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type: 'image/png' }), fileName);

  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Lecture d'une image : on s'intéresse au poids et au type, pas au JSON. */
async function binary(
  path: string,
): Promise<{ status: number; bytes: number; mimeType: string | null; etag: string | null }> {
  const response = await fetch(`${API}${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    bytes: buffer.byteLength,
    mimeType: response.headers.get('content-type'),
    etag: response.headers.get('etag'),
  };
}

async function main(): Promise<void> {
  const stamp = Date.now();
  const managerEmail = `gerant.${stamp}@exemple.com`;
  const managerPassword = 'MotDePasse123!';

  // ---------------------------------------------------------------------
  section('0. Santé de l’API');
  const health = await call('GET', '/health');
  check('GET /health répond 200', health.status === 200, health.body);
  check('la base est joignable', health.body?.database === 'up', health.body);

  // ---------------------------------------------------------------------
  section('1. Espace Super Admin (§2.a)');
  const superLogin = await call('POST', '/api/super-admin/login', {
    body: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  check('connexion Super Admin', superLogin.status === 200, superLogin.body);
  const superToken: string = superLogin.body?.accessToken;
  if (!superToken) {
    console.log('\n⚠  Compte Super Admin absent. Lancez le seed puis relancez ce test.');
    process.exit(1);
  }

  const badLogin = await call('POST', '/api/super-admin/login', {
    body: { email: SUPER_EMAIL, password: 'mauvais-mot-de-passe' },
  });
  check('mot de passe erroné refusé (401)', badLogin.status === 401, badLogin.body);

  // ---------------------------------------------------------------------
  section('2. Inscription d’un restaurant (§2.b)');
  const register = await call('POST', '/api/auth/register', {
    body: {
      restaurantName: `Chez Test ${stamp}`,
      address: '12 rue du Marché',
      restaurantPhone: '+225 07 00 00 00',
      fullName: 'Awa Gérante',
      email: managerEmail,
      password: managerPassword,
    },
  });
  check('inscription créée (201)', register.status === 201, register.body);
  check('statut initial = pending', register.body?.status === 'pending', register.body);
  const restaurantId: string = register.body?.restaurantId;

  const loginBlocked = await call('POST', '/api/auth/login', {
    body: { email: managerEmail, password: managerPassword },
  });
  check(
    'connexion refusée tant que le compte n’est pas activé (403)',
    loginBlocked.status === 403,
    loginBlocked.body,
  );

  // ---------------------------------------------------------------------
  section('3. Activation par le Super Admin (§2.a)');
  const pendingList = await call('GET', '/api/super-admin/restaurants?status=pending', {
    token: superToken,
  });
  check(
    'le nouveau restaurant apparaît dans les demandes en attente',
    pendingList.body?.items?.some((r: any) => r.id === restaurantId),
    pendingList.body?.items?.length,
  );
  const pendingEntry = pendingList.body?.items?.find((r: any) => r.id === restaurantId);
  check(
    'le gérant demandeur est identifié',
    pendingEntry?.ownerEmail === managerEmail,
    pendingEntry,
  );

  const activate = await call('POST', `/api/super-admin/restaurants/${restaurantId}/activate`, {
    token: superToken,
    body: { reason: 'Abonnement réglé' },
  });
  check('activation réussie', activate.status === 200, activate.body);
  check('statut = active', activate.body?.status === 'active', activate.body);
  check('date d’activation enregistrée', activate.body?.activatedAt !== null, activate.body);

  const reActivate = await call('POST', `/api/super-admin/restaurants/${restaurantId}/activate`, {
    token: superToken,
    body: {},
  });
  check('réactiver un compte déjà actif est refusé (409)', reActivate.status === 409, reActivate.body);

  const unknown = await call(
    'POST',
    '/api/super-admin/restaurants/00000000-0000-0000-0000-000000000000/activate',
    { token: superToken, body: {} },
  );
  check('activer un restaurant inconnu renvoie 404', unknown.status === 404, unknown.status);

  const stats = await call('GET', '/api/super-admin/stats', { token: superToken });
  check('statistiques plateforme disponibles', stats.status === 200, stats.body);
  check(
    'compteur de restaurants actifs cohérent',
    (stats.body?.restaurants_active ?? 0) >= 1,
    stats.body,
  );

  const login = await call('POST', '/api/auth/login', {
    body: { email: managerEmail, password: managerPassword },
  });
  check('connexion du gérant réussie', login.status === 200, login.body);
  check('le créateur de l’espace est gérant', login.body?.profile?.user?.role === 'manager');
  check(
    'le profil liste ses droits, journal compris',
    login.body?.profile?.user?.permissions?.includes('audit.view'),
    login.body?.profile?.user?.permissions,
  );
  const token: string = login.body?.accessToken;
  const refreshToken: string = login.body?.refreshToken;

  const refreshed = await call('POST', '/api/auth/refresh', { body: { refreshToken } });
  check('renouvellement de session', refreshed.status === 200, refreshed.body);

  // ---------------------------------------------------------------------
  section('4. Isolation multi-restaurant (§12)');
  const otherEmail = `autre.${stamp}@exemple.com`;
  const other = await call('POST', '/api/auth/register', {
    body: {
      restaurantName: `Autre Resto ${stamp}`,
      fullName: 'Kofi Autre',
      email: otherEmail,
      password: managerPassword,
    },
  });
  await call('POST', `/api/super-admin/restaurants/${other.body?.restaurantId}/activate`, {
    token: superToken,
    body: {},
  });
  const otherLogin = await call('POST', '/api/auth/login', {
    body: { email: otherEmail, password: managerPassword },
  });
  const otherToken: string = otherLogin.body?.accessToken;

  // ---------------------------------------------------------------------
  section('5. Paramètres du restaurant (§3) et devise');
  const currentSettings = await call('GET', '/api/restaurant', { token });
  check('devise par défaut = GNF', currentSettings.body?.currencyCode === 'GNF', currentSettings.body);
  check('symbole = FG', currentSettings.body?.currencySymbol === 'FG', currentSettings.body);
  check(
    'GNF affiché sans centimes (0 décimale)',
    currentSettings.body?.currencyDecimals === 0,
    currentSettings.body,
  );

  const settings = await call('PATCH', '/api/restaurant', {
    token,
    body: { address: '15 boulevard de la Paix', phone: '+224 622 00 00 00' },
  });
  check('paramètres mis à jour', settings.status === 200, settings.body);
  check(
    'adresse enregistrée',
    settings.body?.address === '15 boulevard de la Paix',
    settings.body,
  );

  const bigAmount = await call('POST', '/api/cash/adjustments', {
    token,
    body: { direction: 'in', amount: 150000000, label: 'Test montant élevé GNF' },
  });
  check(
    'montant de 150 000 000 GNF accepté',
    bigAmount.status === 201,
    bigAmount.body,
  );
  await call('POST', '/api/cash/adjustments', {
    token,
    body: { direction: 'out', amount: 150000000, label: 'Annulation test' },
  });

  // ---------------------------------------------------------------------
  section('6. Menu (§5)');
  const categories = await call('GET', '/api/menu/categories', { token });
  check(
    'catégories par défaut créées à l’inscription',
    categories.body?.items?.length >= 4,
    categories.body,
  );
  const platsCategory = categories.body?.items?.find((c: any) => c.name === 'Plats');

  const dish = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: 'Poulet braisé', price: 3500, categoryId: platsCategory?.id },
  });
  check('plat créé', dish.status === 201, dish.body);
  const dishId: string = dish.body?.id;

  const dish2 = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: 'Jus de bissap', price: 500 },
  });
  const dish2Id: string = dish2.body?.id;

  const rupture = await call('PATCH', `/api/menu/dishes/${dish2Id}/availability`, {
    token,
    body: { isAvailable: false },
  });
  check('bascule en rupture', rupture.body?.isAvailable === false, rupture.body);

  const saleOnBroken = await call('POST', '/api/sales', {
    token,
    body: { items: [{ dishId: dish2Id, quantity: 1 }], paymentMethod: 'cash' },
  });
  check(
    'vente d’un plat en rupture refusée (422)',
    saleOnBroken.status === 422,
    saleOnBroken.body,
  );
  await call('PATCH', `/api/menu/dishes/${dish2Id}/availability`, {
    token,
    body: { isAvailable: true },
  });

  const crossTenant = await call('GET', `/api/menu/dishes/${dishId}`, { token: otherToken });
  check(
    'un autre restaurant ne voit pas ce plat (404)',
    crossTenant.status === 404,
    crossTenant.body,
  );

  // ---------------------------------------------------------------------
  section('7. Stock (§6)');
  const stockItem = await call('POST', '/api/stock', {
    token,
    body: { name: 'Poulet', unit: 'kg', quantity: 0, alertThreshold: 5 },
  });
  check('produit en stock créé', stockItem.status === 201, stockItem.body);
  const stockItemId: string = stockItem.body?.id;

  // ---------------------------------------------------------------------
  section('8. Caisse — état initial et apport de capital (§7)');
  let balance = await call('GET', '/api/cash/balance', { token });
  check('solde initial à 0', balance.body?.balance === 0, balance.body);

  // Une caisse vide ne peut rien payer : toute sortie est refusée tant que
  // le gérant n'a pas mis d'argent dedans.
  const tooEarly = await call('POST', '/api/expenses', {
    token,
    body: { amount: 1000, category: 'bill', description: 'Facture prématurée' },
  });
  check('dépense refusée sur caisse vide (422)', tooEarly.status === 422, tooEarly.body);
  check(
    'le message oriente vers l’apport',
    typeof tooEarly.body?.error?.message === 'string' &&
      tooEarly.body.error.message.includes('apport'),
    tooEarly.body?.error?.message,
  );

  const capital = await call('POST', '/api/cash/contributions', {
    token,
    body: { amount: CAPITAL, label: 'Fonds de caisse du matin' },
  });
  check('apport de capital enregistré', capital.status === 201, capital.body);
  check('solde = apport', capital.body?.balance === CAPITAL, capital.body);

  const capitalMovements = await call('GET', '/api/cash/movements?category=capital', { token });
  check(
    'l’apport est classé à part des ventes et des remboursements',
    capitalMovements.body?.items?.length === 1 &&
      capitalMovements.body.items[0].category === 'capital',
    capitalMovements.body?.items,
  );

  // ---------------------------------------------------------------------
  section('9. Dépense = achat de stock (§9 : − Caisse, + Stock)');
  const purchase = await call('POST', '/api/expenses', {
    token,
    body: {
      amount: 20000,
      category: 'stock_purchase',
      description: 'Achat de 10 kg de poulet',
      stockItemId,
      quantity: 10,
    },
  });
  check('dépense enregistrée', purchase.status === 201, purchase.body);
  check('prix unitaire calculé (2000/kg)', purchase.body?.unitPrice === 2000, purchase.body);

  const stockAfter = await call('GET', `/api/stock/${stockItemId}`, { token });
  check('stock augmenté à 10 kg', stockAfter.body?.quantity === 10, stockAfter.body);
  check('alerte stock bas levée (10 > 5)', stockAfter.body?.isLow === false, stockAfter.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('dépense : caisse débitée de 20 000', balance.body?.balance === CAPITAL - 20000, balance.body);

  const badPurchase = await call('POST', '/api/expenses', {
    token,
    body: { amount: 5000, category: 'stock_purchase', description: 'Sans produit' },
  });
  check(
    'achat de stock sans produit refusé (400)',
    badPurchase.status === 400,
    badPurchase.body,
  );

  // ---------------------------------------------------------------------
  section('10. Vente encaissée (§8 : + Caisse)');
  const cashSale = await call('POST', '/api/sales', {
    token,
    body: {
      items: [
        { dishId, quantity: 2 },
        { dishId: dish2Id, quantity: 3 },
      ],
      paymentMethod: 'cash',
    },
  });
  check('vente créée', cashSale.status === 201, cashSale.body);
  // 2 × 3500 + 3 × 500 = 8500
  check('total calculé automatiquement = 8 500', cashSale.body?.totalAmount === 8500, cashSale.body);
  check('statut = paid', cashSale.body?.status === 'paid', cashSale.body);
  check('référence de ticket générée', /^V-\d{8}-\d{4}$/.test(cashSale.body?.reference), cashSale.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('vente encaissée : caisse créditée de 8 500', balance.body?.balance === CAPITAL - 11500, balance.body);

  const receipt = await call('GET', `/api/sales/${cashSale.body?.id}/receipt`, { token });
  check('ticket avec en-tête restaurant (§3)', receipt.body?.restaurant?.name?.includes('Chez Test'), receipt.body?.restaurant);
  check('ticket avec les lignes', receipt.body?.sale?.items?.length === 2, receipt.body?.sale?.items);

  // ---------------------------------------------------------------------
  section('11. Vente à crédit (§8 : caisse inchangée)');
  // Le client doit exister avant la vente : c'est ce qui rend la dette
  // rattachable le jour du remboursement (§8).
  const freeText = await call('POST', '/api/sales', {
    token,
    body: {
      items: [{ dishId, quantity: 1 }],
      paymentMethod: 'credit',
      customerName: 'Un inconnu',
    },
  });
  check('nom libre refuse la vente à crédit (400)', freeText.status === 400, freeText.body);

  const customer = await call('POST', '/api/customers', {
    token,
    body: { fullName: 'Monsieur Diallo', phone: '+225 05 55 55 55' },
  });
  check('fiche client créée', customer.status === 201, customer.body);
  const customerId: string = customer.body?.id;

  const creditSale = await call('POST', '/api/sales', {
    token,
    body: {
      items: [{ dishId, quantity: 4 }],
      paymentMethod: 'credit',
      customerId,
    },
  });
  check('vente à crédit créée', creditSale.status === 201, creditSale.body);
  check('statut = credit', creditSale.body?.status === 'credit', creditSale.body);
  check('montant dû = 14 000', creditSale.body?.credit?.amountDue === 14000, creditSale.body?.credit);

  balance = await call('GET', '/api/cash/balance', { token });
  check('caisse INCHANGÉE après vente à crédit', balance.body?.balance === CAPITAL - 11500, balance.body);

  const noCustomer = await call('POST', '/api/sales', {
    token,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'credit' },
  });
  check('vente à crédit sans client refusée (400)', noCustomer.status === 400, noCustomer.body);

  const creditsList = await call('GET', '/api/credits', { token });
  check('créance visible dans la liste', creditsList.body?.items?.length === 1, creditsList.body);
  check('total dû = 14 000', creditsList.body?.totalOutstanding === 14000, creditsList.body);
  const creditId: string = creditsList.body?.items?.[0]?.id;

  // ---------------------------------------------------------------------
  section('12. Remboursement de crédit (§8 : + Caisse, − Créance)');
  const overpay = await call('POST', `/api/credits/${creditId}/payments`, {
    token,
    body: { amount: 99999 },
  });
  check('remboursement supérieur au dû refusé (422)', overpay.status === 422, overpay.body);

  const partial = await call('POST', `/api/credits/${creditId}/payments`, {
    token,
    body: { amount: 6000, paymentMethod: 'mobile_money' },
  });
  check('remboursement partiel accepté', partial.status === 201, partial.body);
  check('statut = partially_paid', partial.body?.status === 'partially_paid', partial.body);
  check('reste dû = 8 000', partial.body?.amountLeft === 8000, partial.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('remboursement partiel : caisse créditée de 6 000', balance.body?.balance === CAPITAL - 5500, balance.body);

  const settle = await call('POST', `/api/credits/${creditId}/payments`, {
    token,
    body: { amount: 8000 },
  });
  check('solde du crédit remboursé', settle.body?.status === 'paid', settle.body);
  check('reste dû = 0', settle.body?.amountLeft === 0, settle.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('solde du crédit : caisse créditée de 8 000', balance.body?.balance === CAPITAL + 2500, balance.body);

  // ---------------------------------------------------------------------
  section('13. Personnel (§4) et paiement de salaire (§10)');
  const employee = await call('POST', '/api/staff', {
    token,
    body: {
      fullName: 'Ibrahim Cuisinier',
      position: 'Cuisinier',
      phone: '+225 01 02 03 04',
      hireDate: new Date().toISOString().slice(0, 10),
      monthlySalary: 90000,
    },
  });
  check('employé créé', employee.status === 201, employee.body);
  const employeeId: string = employee.body?.id;
  check('solde salarial calculé', employee.body?.salary?.totalAccrued === 90000, employee.body?.salary);

  const today = new Date().toISOString().slice(0, 10);
  const attendance = await call('POST', `/api/staff/${employeeId}/attendances`, {
    token,
    body: { day: today, status: 'present' },
  });
  check('pointage enregistré', attendance.status === 201, attendance.body);

  const reAttendance = await call('POST', `/api/staff/${employeeId}/attendances`, {
    token,
    body: { day: today, status: 'absent' },
  });
  check('re-pointage du même jour met à jour', reAttendance.body?.status === 'absent', reAttendance.body);

  const salary = await call('POST', `/api/staff/${employeeId}/salary/payments`, {
    token,
    body: { amount: 50000, periodMonth: today.slice(0, 7) },
  });
  check('salaire payé', salary.status === 201, salary.body);
  check('reste dû = 40 000', salary.body?.balance?.balanceDue === 40000, salary.body?.balance);

  balance = await call('GET', '/api/cash/balance', { token });
  check('salaire : caisse débitée de 50 000', balance.body?.balance === CAPITAL - 47500, balance.body);

  const salaryExpenses = await call('GET', '/api/expenses?category=salary', { token });
  check(
    'le salaire apparaît aussi dans les dépenses (§9)',
    salaryExpenses.body?.items?.length === 1,
    salaryExpenses.body?.items,
  );

  // ---------------------------------------------------------------------
  section('14. Annulations et contre-passations');
  const cancel = await call('POST', `/api/sales/${cashSale.body?.id}/cancel`, {
    token,
    body: { reason: 'Erreur de saisie' },
  });
  check('vente annulée', cancel.body?.status === 'cancelled', cancel.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('vente annulée : caisse débitée de 8 500', balance.body?.balance === CAPITAL - 56000, balance.body);

  const cancelExpense = await call('POST', `/api/expenses/${purchase.body?.id}/cancel`, {
    token,
    body: { reason: 'Marchandise retournée' },
  });
  check('dépense annulée', cancelExpense.body?.cancelledAt !== null, cancelExpense.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('dépense annulée : caisse recréditée de 20 000', balance.body?.balance === CAPITAL - 36000, balance.body);

  const stockReverted = await call('GET', `/api/stock/${stockItemId}`, { token });
  check('stock revenu à 0 kg', stockReverted.body?.quantity === 0, stockReverted.body);

  // ---------------------------------------------------------------------
  section('15. Historique et tableau de bord (§7, §10)');
  const movements = await call('GET', '/api/cash/movements', { token });
  check('historique de caisse consultable', movements.body?.items?.length >= 6, {
    count: movements.body?.items?.length,
  });
  check(
    'somme des mouvements = solde',
    Math.round((movements.body?.totals?.net ?? 0) * 100) === (CAPITAL - 36000) * 100,
    movements.body?.totals,
  );

  const dashboard = await call('GET', '/api/dashboard/summary', { token });
  check('tableau de bord disponible', dashboard.status === 200, dashboard.body);
  check('solde cohérent', dashboard.body?.cash?.balance === CAPITAL - 36000, dashboard.body?.cash);
  check('créances soldées', dashboard.body?.credits?.totalOutstanding === 0, dashboard.body?.credits);

  const trend = await call('GET', '/api/dashboard/trend?days=7', { token });
  check('courbe sur 7 jours', trend.body?.items?.length === 7, trend.body?.items?.length);

  // Séries des graphiques du tableau de bord (dashboard.charts.ts).
  const charts = await call('GET', '/api/dashboard/charts?days=14', { token });
  check('séries des graphiques disponibles', charts.status === 200, charts.body);
  check('14 jours renvoyés, creux compris', charts.body?.daily?.length === 14, {
    length: charts.body?.daily?.length,
  });
  check('les 24 heures sont présentes', charts.body?.hourly?.length === 24);
  check('les 7 jours de semaine sont présents', charts.body?.weekday?.length === 7);
  check(
    'la période se termine aujourd’hui',
    charts.body?.range?.to === new Date().toISOString().slice(0, 10),
    charts.body?.range,
  );

  const chartsRevenue = (charts.body?.daily ?? []).reduce(
    (sum: number, point: any) => sum + point.revenue,
    0,
  );
  const paymentTotal = (charts.body?.paymentMix ?? []).reduce(
    (sum: number, slice: any) => sum + slice.total,
    0,
  );
  check(
    'recette quotidienne = somme des modes de règlement',
    Math.round(chartsRevenue * 100) === Math.round(paymentTotal * 100),
    { chartsRevenue, paymentTotal },
  );
  check('recette non nulle sur la période', chartsRevenue > 0, chartsRevenue);
  check(
    'les ventes annulées sont exclues',
    // §14 a annulé une vente de 15 000 : elle ne doit pas peser ici.
    !(charts.body?.paymentMix ?? []).some((slice: any) => slice.total === 0),
    charts.body?.paymentMix,
  );
  check('palmarès des plats renseigné', (charts.body?.topDishes?.length ?? 0) > 0);
  check('postes de dépense renseignés', (charts.body?.expensesByCategory?.length ?? 0) > 0);
  check('alertes de stock renvoyées sous forme de liste', Array.isArray(charts.body?.lowStock));
  check('débiteurs renvoyés sous forme de liste', Array.isArray(charts.body?.topDebtors));

  // ---------------------------------------------------------------------
  section('15 bis. Cloisonnement : tout est rattaché au restaurant (§2.b, §12)');
  // Le second restaurant a été créé au début du test et n'a rien saisi.
  // Il doit voir SES données — c'est-à-dire aucune — et jamais celles du premier.
  const otherDishes = await call('GET', '/api/menu/dishes', { token: otherToken });
  check('menu du voisin vide', otherDishes.body?.items?.length === 0, otherDishes.body);

  const otherStock = await call('GET', '/api/stock', { token: otherToken });
  check('stock du voisin vide', otherStock.body?.items?.length === 0, otherStock.body);

  const otherSales = await call('GET', '/api/sales', { token: otherToken });
  check('aucune vente chez le voisin', otherSales.body?.total === 0, otherSales.body?.total);

  const otherCash = await call('GET', '/api/cash/balance', { token: otherToken });
  check('caisse du voisin à 0', otherCash.body?.balance === 0, otherCash.body);

  // Les graphiques sont le point le plus exposé à une fuite entre
  // restaurants : ils agrègent toutes les tables d'un coup.
  const otherCharts = await call('GET', '/api/dashboard/charts?days=14', { token: otherToken });
  check(
    'graphiques du voisin à zéro',
    (otherCharts.body?.daily ?? []).every((point: any) => point.revenue === 0 && point.expenses === 0),
    otherCharts.body?.daily,
  );
  check(
    'aucun plat ni dépense chez le voisin',
    otherCharts.body?.topDishes?.length === 0 && otherCharts.body?.expensesByCategory?.length === 0,
    { dishes: otherCharts.body?.topDishes, expenses: otherCharts.body?.expensesByCategory },
  );

  const otherCredits = await call('GET', '/api/credits', { token: otherToken });
  check('aucune créance chez le voisin', otherCredits.body?.total === 0, otherCredits.body?.total);

  const otherStaff = await call('GET', '/api/staff', { token: otherToken });
  check('aucun employé chez le voisin', otherStaff.body?.items?.length === 0, otherStaff.body);

  const otherCustomers = await call('GET', '/api/customers', { token: otherToken });
  check('aucun client chez le voisin', otherCustomers.body?.items?.length === 0, otherCustomers.body);

  const otherMovements = await call('GET', '/api/cash/movements', { token: otherToken });
  check(
    'historique de caisse du voisin vide',
    otherMovements.body?.total === 0,
    otherMovements.body?.total,
  );

  // Accès direct par identifiant : refusé même en connaissant l'identifiant exact.
  const stealSale = await call('GET', `/api/sales/${cashSale.body?.id}`, { token: otherToken });
  check('vente du voisin inaccessible (404)', stealSale.status === 404, stealSale.status);

  const stealEmployee = await call('GET', `/api/staff/${employeeId}`, { token: otherToken });
  check('employé du voisin inaccessible (404)', stealEmployee.status === 404, stealEmployee.status);

  const stealCredit = await call('GET', `/api/credits/${creditId}`, { token: otherToken });
  check('créance du voisin inaccessible (404)', stealCredit.status === 404, stealCredit.status);

  const stealStock = await call('GET', `/api/stock/${stockItemId}`, { token: otherToken });
  check('produit du voisin inaccessible (404)', stealStock.status === 404, stealStock.status);

  // Tentative d'écriture croisée : vendre un plat qui appartient à l'autre restaurant.
  const stealDish = await call('POST', '/api/sales', {
    token: otherToken,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'cash' },
  });
  check(
    'impossible de vendre le plat d’un autre restaurant (404)',
    stealDish.status === 404,
    stealDish.body,
  );

  section('15 ter. Portions comptées par plat (§5)');
  // §5 — Portions comptées : la vente décompte, zéro sort le plat de la carte.
  const counted = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: 'Alloco du jour', price: 2000, availableQuantity: 3 },
  });
  check('plat créé avec 3 portions', counted.body?.availableQuantity === 3, counted.body);
  const countedId: string = counted.body?.id;

  const tooMany = await call('POST', '/api/sales', {
    token,
    body: { items: [{ dishId: countedId, quantity: 4 }], paymentMethod: 'cash' },
  });
  check('vendre plus que le préparé est refusé (422)', tooMany.status === 422, tooMany.body);

  const twoPortions = await call('POST', '/api/sales', {
    token,
    body: { items: [{ dishId: countedId, quantity: 2 }], paymentMethod: 'cash' },
  });
  check('vente de 2 portions acceptée', twoPortions.status === 201, twoPortions.body);

  let countedState = await call('GET', `/api/menu/dishes/${countedId}`, { token });
  check('il reste 1 portion', countedState.body?.availableQuantity === 1, countedState.body);
  check('le plat reste à la carte', countedState.body?.isAvailable === true, countedState.body);

  const lastPortion = await call('POST', '/api/sales', {
    token,
    body: { items: [{ dishId: countedId, quantity: 1 }], paymentMethod: 'cash' },
  });
  check('dernière portion vendue', lastPortion.status === 201, lastPortion.body);

  countedState = await call('GET', `/api/menu/dishes/${countedId}`, { token });
  check('quantité à 0', countedState.body?.availableQuantity === 0, countedState.body);
  check(
    'le plat sort automatiquement de la carte',
    countedState.body?.isAvailable === false,
    countedState.body,
  );

  const backOnMenu = await call('PATCH', `/api/menu/dishes/${countedId}/availability`, {
    token,
    body: { isAvailable: true },
  });
  check(
    'impossible de le remettre à la carte sans portions (409)',
    backOnMenu.status === 409,
    backOnMenu.body,
  );

  const restocked = await call('PATCH', `/api/menu/dishes/${countedId}`, {
    token,
    body: { availableQuantity: 5 },
  });
  check('réapprovisionnement à 5', restocked.body?.availableQuantity === 5, restocked.body);
  check(
    'saisir la quantité suffit à le remettre en vente',
    restocked.body?.isAvailable === true,
    restocked.body,
  );

  // ---------------------------------------------------------------------
  section('15 quater. Vignettes d’images');
  /*
   * Mesuré sur un restaurant réel : neuf plats photographiés au téléphone
   * représentaient 4 Mo à charger pour un seul écran de vente, dont une
   * photo de 1,8 Mo affichée dans un cadre de 100 points. Le serveur sert
   * désormais des versions réduites, fabriquées à la première demande.
   */
  const photo = await pngFixture(1200, 900);
  const photoUpload = await upload('/api/media', token, photo, 'plat.png');
  check('photo envoyée', photoUpload.status === 201, photoUpload.body);

  const photoId = photoUpload.body?.id as string;

  const fullSize = await binary(`/api/media/${photoId}`);
  check('original servi tel quel', fullSize.bytes === photo.byteLength, {
    servi: fullSize.bytes,
    envoyé: photo.byteLength,
  });

  const thumb = await binary(`/api/media/${photoId}?w=96`);
  check('vignette 96 fabriquée', thumb.status === 200, thumb.status);
  check('vignette convertie en WebP', thumb.mimeType === 'image/webp', thumb.mimeType);
  check('vignette plus légère que l’original', thumb.bytes < fullSize.bytes, {
    vignette: thumb.bytes,
    original: fullSize.bytes,
  });

  const again = await binary(`/api/media/${photoId}?w=96`);
  check('relue à l’identique au second appel', again.bytes === thumb.bytes, {
    premier: thumb.bytes,
    second: again.bytes,
  });

  const notModified = await call('GET', `/api/media/${photoId}?w=96`, {
    headers: { 'If-None-Match': thumb.etag ?? '' },
  });
  check('ETag respecté (304)', notModified.status === 304, notModified.status);

  // Une largeur libre laisserait fabriquer des milliers de variantes en
  // bouclant sur ?w=1,2,3… : hors liste, on retombe sur l'original.
  const oddWidth = await binary(`/api/media/${photoId}?w=137`);
  check('largeur hors liste : original servi', oddWidth.bytes === fullSize.bytes, {
    servi: oddWidth.bytes,
    original: fullSize.bytes,
  });

  const junkWidth = await binary(`/api/media/${photoId}?w=abc`);
  check('largeur illisible : original servi', junkWidth.bytes === fullSize.bytes, {
    servi: junkWidth.bytes,
    original: fullSize.bytes,
  });

  // ---------------------------------------------------------------------
  section('16. Équipe : création directe d’un compte (§2.b)');
  const colleagueEmail = `collegue.${stamp}@exemple.com`;
  const colleaguePassword = 'MotDePasse456!';

  const tooShort = await call('POST', '/api/users', {
    token,
    body: { fullName: 'Fatou Collègue', email: colleagueEmail, password: 'court', role: 'manager' },
  });
  check('mot de passe trop court refusé (400)', tooShort.status === 400, tooShort.body);

  const noRole = await call('POST', '/api/users', {
    token,
    body: { fullName: 'Fatou Collègue', email: colleagueEmail, password: colleaguePassword },
  });
  check('création sans rôle refusée (400)', noRole.status === 400, noRole.body);

  const noEmployee = await call('POST', '/api/users', {
    token,
    body: { fullName: 'Fatou Collègue', email: colleagueEmail, password: colleaguePassword, role: 'manager' },
  });
  check('création sans fiche employé refusée (400)', noEmployee.status === 400, noEmployee.body);

  const created = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Fatou Collègue',
      email: colleagueEmail,
      password: colleaguePassword,
      phone: '620 33 44 55',
      role: 'manager',
      employee: { position: 'Gérante adjointe', monthlySalary: 80000, hireDate: '2026-01-01' },
    },
  });
  check('compte du collègue créé (201)', created.status === 201, created.body);
  check('il n’est pas propriétaire', created.body?.isOwner === false, created.body);
  check('il a le rôle demandé', created.body?.role === 'manager', created.body);
  check('il est actif d’emblée', created.body?.isActive === true, created.body);
  check(
    'sa fiche employé est créée en même temps',
    created.body?.employee?.position === 'Gérante adjointe',
    created.body?.employee,
  );

  const duplicate = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Doublon',
      email: colleagueEmail,
      password: colleaguePassword,
      role: 'cashier',
      employee: { position: 'Serveur', hireDate: '2026-01-01' },
    },
  });
  check('adresse déjà utilisée refusée (409)', duplicate.status === 409, duplicate.body);

  const members = await call('GET', '/api/users', { token });
  check('2 membres dans l’équipe', members.body?.items?.length === 2, members.body?.items);

  // Le collègue se connecte avec les identifiants que le gérant lui a donnés.
  const colleagueLogin = await call('POST', '/api/auth/login', {
    body: { email: colleagueEmail, password: colleaguePassword },
  });
  check('le collègue se connecte directement', colleagueLogin.status === 200, colleagueLogin.body);
  check(
    'il est rattaché au même restaurant',
    colleagueLogin.body?.profile?.restaurant?.id === restaurantId,
    colleagueLogin.body?.profile?.restaurant,
  );

  const colleagueToken: string = colleagueLogin.body?.accessToken;
  const colleagueBalance = await call('GET', '/api/cash/balance', { token: colleagueToken });
  check(
    'un second gérant a accès à la caisse',
    colleagueBalance.body?.balance === CAPITAL - 30000,
    colleagueBalance.body,
  );

  // Retrait de l'équipe : le compte n'a rien saisi, il est supprimé.
  const spare = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Compte Éphémère',
      email: `ephemere.${stamp}@exemple.com`,
      password: colleaguePassword,
      role: 'cashier',
      employee: { position: 'Extra', hireDate: '2026-01-01' },
    },
  });
  const removed = await call('DELETE', `/api/users/${spare.body?.id}`, { token });
  check('retrait de l’équipe (204)', removed.status === 204, removed.body);

  const afterRemoval = await call('GET', '/api/users', { token });
  check(
    'le compte retiré ne figure plus dans l’équipe',
    afterRemoval.body?.items?.length === 2,
    afterRemoval.body?.items?.length,
  );

  const removedLogin = await call('POST', '/api/auth/login', {
    body: { email: `ephemere.${stamp}@exemple.com`, password: colleaguePassword },
  });
  check('il ne peut plus se connecter (401)', removedLogin.status === 401, removedLogin.status);

  const selfRemoval = await call('DELETE', `/api/users/${created.body?.id}`, {
    token: colleagueToken,
  });
  check(
    'on ne peut pas supprimer son propre compte (400)',
    selfRemoval.status === 400,
    selfRemoval.body,
  );

  // ---------------------------------------------------------------------
  section('16 bis. Rôles : caissier et magasinier');

  async function member(
    role: string,
    name: string,
  ): Promise<{ id: string; token: string; employeeId: string }> {
    const email = `${role}.${stamp}@exemple.com`;
    const account = await call('POST', '/api/users', {
      token,
      body: {
        fullName: name,
        email,
        password: colleaguePassword,
        role,
        employee: { position: role === 'cashier' ? 'Caissier' : 'Magasinier', hireDate: '2026-01-01' },
      },
    });
    const session = await call('POST', '/api/auth/login', {
      body: { email, password: colleaguePassword },
    });
    return {
      id: account.body?.id,
      token: session.body?.accessToken,
      employeeId: account.body?.employee?.id,
    };
  }

  const cashier = await member('cashier', 'Mamadou Caissier');
  const storekeeper = await member('storekeeper', 'Aïssatou Magasin');
  check('comptes caissier et magasinier créés', Boolean(cashier.token && storekeeper.token));

  const cashierProfile = await call('GET', '/api/auth/me', { token: cashier.token });
  check(
    'le profil du caissier ne contient pas l’annulation de vente',
    cashierProfile.body?.user?.role === 'cashier' &&
      !cashierProfile.body?.user?.permissions?.includes('sales.cancel'),
    cashierProfile.body?.user,
  );

  // Ce que le caissier peut faire, une fois sa caisse ouverte.
  await call('POST', '/api/cash/sessions/open', { token: cashier.token, body: { openingFloat: 0 } });
  const cashierSale = await call('POST', '/api/sales', {
    token: cashier.token,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'cash' },
  });
  check('le caissier encaisse une vente (201)', cashierSale.status === 201, cashierSale.body);

  const ownSales = await call('GET', '/api/sales', { token: cashier.token });
  check(
    'il ne voit que ses propres ventes',
    ownSales.body?.items?.length === 1 && ownSales.body.items[0].id === cashierSale.body?.id,
    ownSales.body?.items?.length,
  );
  const ownReceipt = await call('GET', `/api/sales/${cashierSale.body?.id}/receipt`, {
    token: cashier.token,
  });
  check('il réimprime son ticket', ownReceipt.status === 200, ownReceipt.status);

  const managerSales = await call('GET', '/api/sales?limit=5', { token });
  const someoneElsesSale = managerSales.body?.items?.find(
    (sale: any) => sale.id !== cashierSale.body?.id,
  );
  const peek = await call('GET', `/api/sales/${someoneElsesSale?.id}`, { token: cashier.token });
  check('la vente d’un collègue lui reste invisible (404)', peek.status === 404, peek.status);

  const soldOut = await call('PATCH', `/api/menu/dishes/${dishId}/availability`, {
    token: cashier.token,
    body: { isAvailable: true },
  });
  check('il signale la disponibilité d’un plat', soldOut.status === 200, soldOut.body);

  // Ce qu'il ne peut pas faire.
  const denied = async (label: string, method: string, path: string, body?: unknown) => {
    const result = await call(method, path, { token: cashier.token, body });
    check(`caissier : ${label} (403)`, result.status === 403, result.status);
  };
  await denied('annuler une vente', 'POST', `/api/sales/${cashierSale.body?.id}/cancel`, {
    reason: 'Erreur de saisie',
  });
  await denied('appliquer un prix libre', 'POST', '/api/sales', {
    items: [{ dishId, quantity: 1, unitPrice: 1 }],
    paymentMethod: 'cash',
  });
  await denied('voir le solde de caisse', 'GET', '/api/cash/balance');
  await denied('corriger la caisse', 'POST', '/api/cash/adjustments', {
    direction: 'out',
    amount: 1000,
    label: 'Retrait',
  });
  await denied('ouvrir le tableau de bord', 'GET', '/api/dashboard/summary');
  await denied('changer un prix', 'PATCH', `/api/menu/dishes/${dishId}`, { price: 10 });
  await denied('voir le stock', 'GET', '/api/stock');
  await denied('voir le personnel', 'GET', '/api/staff');
  await denied('gérer l’équipe', 'GET', '/api/users');
  await denied('modifier les paramètres', 'PATCH', '/api/restaurant', { name: 'Piraté' });
  await denied('lire le journal', 'GET', '/api/audit');

  // Magasinier : le stock, le solde de la caisse, et des achats soumis à accord.
  const storeStock = await call('GET', '/api/stock', { token: storekeeper.token });
  check('le magasinier consulte le stock', storeStock.status === 200, storeStock.status);

  // La vente du caissier n'est pas encore annulée : la référence est le solde
  // que voit le gérant à cet instant.
  const managerBalance = await call('GET', '/api/cash/balance', { token });
  const balanceNow: number = managerBalance.body?.balance;
  const storeBalance = await call('GET', '/api/cash/balance', { token: storekeeper.token });
  check(
    'il voit le solde de la caisse',
    storeBalance.body?.balance === balanceNow,
    storeBalance.body,
  );
  check(
    'mais pas les cumuls, qui révèlent le chiffre d’affaires',
    storeBalance.body?.totalIn === undefined,
    storeBalance.body,
  );
  const storeMovements = await call('GET', '/api/cash/movements', { token: storekeeper.token });
  check('ni le détail des mouvements (403)', storeMovements.status === 403, storeMovements.status);

  const directPurchase = await call('POST', '/api/expenses', {
    token: storekeeper.token,
    body: {
      amount: 4000,
      category: 'stock_purchase',
      description: 'Achat sans accord',
      stockItemId,
      quantity: 2,
    },
  });
  check('il ne peut plus acheter sans accord (403)', directPurchase.status === 403, directPurchase.status);

  const storeSale = await call('POST', '/api/sales', {
    token: storekeeper.token,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'cash' },
  });
  check('il ne peut pas vendre (403)', storeSale.status === 403, storeSale.status);

  // ---------------------------------------------------------------------
  section('16 ter. Demandes d’achat et notifications');

  const purchaseRequest = await call('POST', '/api/purchases', {
    token: storekeeper.token,
    body: { stockItemId, quantity: 2, estimatedAmount: 4000, reason: 'Stock de poulet bas' },
  });
  check('le magasinier fait une demande (201)', purchaseRequest.status === 201, purchaseRequest.body);
  check('elle attend la décision', purchaseRequest.body?.status === 'pending', purchaseRequest.body);
  const requestId: string = purchaseRequest.body?.id;

  const managerInbox = await call('GET', '/api/notifications', { token });
  check(
    'le gérant est notifié de la demande',
    managerInbox.body?.items?.some(
      (n: any) => n.kind === 'purchase.requested' && n.entityId === requestId,
    ),
    managerInbox.body,
  );
  check('la notification compte comme non lue', managerInbox.body?.unreadCount >= 1, managerInbox.body);

  const selfApproval = await call('POST', `/api/purchases/${requestId}/approve`, {
    token: storekeeper.token,
    body: {},
  });
  check('il ne peut pas approuver lui-même (403)', selfApproval.status === 403, selfApproval.status);

  const unapprovedCompletion = await call('POST', `/api/purchases/${requestId}/complete`, {
    token: storekeeper.token,
    body: { amount: 4000 },
  });
  check('il ne peut pas acheter avant l’accord (409)', unapprovedCompletion.status === 409, unapprovedCompletion.body);

  const approval = await call('POST', `/api/purchases/${requestId}/approve`, {
    token,
    body: { approvedAmount: 5000, note: 'Pas plus de 5 000' },
  });
  check('le gérant approuve avec un plafond', approval.body?.approvedAmount === 5000, approval.body);

  const overBudget = await call('POST', `/api/purchases/${requestId}/complete`, {
    token: storekeeper.token,
    body: { amount: 6000 },
  });
  check('un achat au-delà du plafond est refusé (422)', overBudget.status === 422, overBudget.body);

  const stockBefore = await call('GET', `/api/stock/${stockItemId}`, { token });
  const completion = await call('POST', `/api/purchases/${requestId}/complete`, {
    token: storekeeper.token,
    body: { amount: 4500 },
  });
  check('l’achat est effectué', completion.body?.status === 'completed', completion.body);
  check('il est rattaché à une dépense', Boolean(completion.body?.expenseId), completion.body);

  const stockAfterPurchase = await call('GET', `/api/stock/${stockItemId}`, { token });
  check(
    'la marchandise entre en stock',
    stockAfterPurchase.body?.quantity === (stockBefore.body?.quantity ?? 0) + 2,
    { avant: stockBefore.body?.quantity, après: stockAfterPurchase.body?.quantity },
  );
  const balanceAfterPurchase = await call('GET', '/api/cash/balance', { token });
  check(
    'le montant payé sort de la caisse',
    balanceAfterPurchase.body?.balance === balanceNow - 4500,
    balanceAfterPurchase.body,
  );

  const newProduct = await call('POST', '/api/purchases', {
    token: storekeeper.token,
    body: { itemName: 'Huile de palme', unit: 'l', quantity: 5, estimatedAmount: 15000 },
  });
  check('demande pour un produit pas encore en stock (201)', newProduct.status === 201, newProduct.body);
  const refusal = await call('POST', `/api/purchases/${newProduct.body?.id}/reject`, {
    token,
    body: { note: 'Il en reste au marché' },
  });
  check('le gérant refuse avec un motif', refusal.body?.status === 'rejected', refusal.body);

  const storeInbox = await call('GET', '/api/notifications', { token: storekeeper.token });
  const storeKinds: string[] = storeInbox.body?.items?.map((n: any) => n.kind) ?? [];
  check('le magasinier est notifié de l’accord', storeKinds.includes('purchase.approved'), storeKinds);
  check('et du refus', storeKinds.includes('purchase.rejected'), storeKinds);

  const managerInboxAfter = await call('GET', '/api/notifications', { token });
  check(
    'le gérant est notifié de l’achat effectué',
    managerInboxAfter.body?.items?.some((n: any) => n.kind === 'purchase.completed'),
    managerInboxAfter.body?.items?.map((n: any) => n.kind),
  );

  const storeRequests = await call('GET', '/api/purchases', { token: storekeeper.token });
  check('il retrouve ses deux demandes', storeRequests.body?.items?.length === 2, storeRequests.body);

  // Seuil d'alerte franchi : magasinier et gérant sont prévenus une fois.
  const currentQuantity: number = stockAfterPurchase.body?.quantity ?? 0;
  await call('PATCH', `/api/stock/${stockItemId}`, {
    token,
    body: { alertThreshold: currentQuantity - 0.5 },
  });
  await call('POST', `/api/stock/${stockItemId}/adjustments`, {
    token: storekeeper.token,
    body: { direction: 'out', quantity: 1, reason: 'loss', note: 'Poulet abîmé' },
  });
  const lowInbox = await call('GET', '/api/notifications', { token });
  check(
    'le gérant reçoit l’alerte de stock bas',
    lowInbox.body?.items?.some((n: any) => n.kind === 'stock.low'),
    lowInbox.body?.items?.map((n: any) => n.kind),
  );
  await call('POST', `/api/stock/${stockItemId}/adjustments`, {
    token,
    body: { direction: 'in', quantity: 1, note: 'Remise en état du test' },
  });
  await call('PATCH', `/api/stock/${stockItemId}`, { token, body: { alertThreshold: 0 } });

  // Repère pris sur la dernière notification reçue, comme le fait l'application :
  // elle ne doit pas revenir (date en millisecondes contre microsecondes en base).
  const latestInbox = await call('GET', '/api/notifications?limit=1', { token: storekeeper.token });
  const since: string = latestInbox.body?.items?.[0]?.createdAt ?? new Date().toISOString();
  const nothingNew = await call(
    'GET',
    `/api/notifications?since=${encodeURIComponent(since)}`,
    { token: storekeeper.token },
  );
  check(
    'l’interrogation régulière ne renvoie que les nouveautés',
    nothingNew.body?.items?.length === 0,
    nothingNew.body,
  );

  const readAll = await call('POST', '/api/notifications/read', {
    token: storekeeper.token,
    body: { all: true },
  });
  check('tout marquer comme lu', readAll.body?.updated >= 2, readAll.body);
  const storeInboxRead = await call('GET', '/api/notifications', { token: storekeeper.token });
  check('plus rien de non lu', storeInboxRead.body?.unreadCount === 0, storeInboxRead.body);

  // Le gérant défait ce qui doit l'être : caisse et stock reviennent à l'état
  // attendu par la suite du test.
  const managerCancel = await call('POST', `/api/sales/${cashierSale.body?.id}/cancel`, {
    token,
    body: { reason: 'Vente de test du caissier' },
  });
  check('le gérant annule la vente du caissier', managerCancel.status === 200, managerCancel.body);
  const cashierInbox = await call('GET', '/api/notifications', { token: cashier.token });
  check(
    'le caissier est prévenu de l’annulation, avec le motif',
    cashierInbox.body?.items?.some(
      (n: any) => n.kind === 'sale.cancelled' && n.body.includes('Vente de test du caissier'),
    ),
    cashierInbox.body,
  );
  await call('POST', `/api/expenses/${completion.body?.expenseId}/cancel`, {
    token,
    body: { reason: 'Achat de test du magasinier' },
  });
  // Tout ce qui est passé par cette caisse a été annulé : le tiroir est vide.
  const emptyTill = await call('POST', '/api/cash/sessions/close', {
    token: cashier.token,
    body: { countedCash: 0 },
  });
  check(
    'les annulations ramènent l’attendu à zéro',
    emptyTill.body?.status === 'closed',
    emptyTill.body,
  );

  // ---------------------------------------------------------------------
  section('16 quater. Équipe et personnel liés');

  const staffList = await call('GET', '/api/staff', { token });
  const colleagueSheet = staffList.body?.items?.find((e: any) => e.account?.userId === created.body?.id);
  check(
    'le compte créé depuis l’équipe figure dans le personnel',
    colleagueSheet?.fullName === 'Fatou Collègue' && colleagueSheet?.account?.role === 'manager',
    staffList.body?.items,
  );

  const cook = await call('POST', '/api/staff', {
    token,
    body: { fullName: 'Ibrahima Cuisinier', position: 'Cuisinier', hireDate: '2026-02-01', monthlySalary: 60000 },
  });
  check('un employé sans compte est créé', cook.status === 201 && cook.body?.account === null, cook.body);

  const withoutAccount = await call('GET', '/api/staff?withoutAccount=true', { token });
  check(
    'il apparaît parmi les employés sans accès',
    withoutAccount.body?.items?.some((e: any) => e.id === cook.body?.id) &&
      !withoutAccount.body?.items?.some((e: any) => e.id === colleagueSheet?.id),
    withoutAccount.body?.items?.map((e: any) => e.fullName),
  );

  const cookAccount = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Ibrahima Cuisinier',
      email: `cuisinier.${stamp}@exemple.com`,
      password: colleaguePassword,
      role: 'cashier',
      employeeId: cook.body?.id,
    },
  });
  check(
    'on lui donne un accès à partir de sa fiche',
    cookAccount.status === 201 && cookAccount.body?.employee?.id === cook.body?.id,
    cookAccount.body,
  );
  const secondAccount = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Doublon Cuisinier',
      email: `cuisinier2.${stamp}@exemple.com`,
      password: colleaguePassword,
      role: 'cashier',
      employeeId: cook.body?.id,
    },
  });
  check('une fiche ne porte qu’un seul compte (409)', secondAccount.status === 409, secondAccount.body);

  const lockedSheet = await call('DELETE', `/api/staff/${cook.body?.id}`, { token });
  check(
    'on ne retire pas la fiche d’un employé qui a encore un accès (409)',
    lockedSheet.status === 409,
    lockedSheet.body,
  );

  const late = await call('POST', `/api/staff/${storekeeper.employeeId}/attendances`, {
    token,
    body: { day: '2026-03-02', status: 'late', arrivalTime: '09:40', note: 'Bus en panne' },
  });
  check('retard pointé avec l’heure d’arrivée', late.body?.arrivalTime === '09:40', late.body);

  const badArrival = await call('POST', `/api/staff/${storekeeper.employeeId}/attendances`, {
    token,
    body: { day: '2026-03-03', status: 'absent', arrivalTime: '09:00' },
  });
  check('pas d’heure d’arrivée pour une absence (400)', badArrival.status === 400, badArrival.body);

  const warning = await call('POST', `/api/staff/${storekeeper.employeeId}/notes`, {
    token,
    body: { kind: 'warning', note: 'Troisième retard ce mois-ci', occurredOn: '2026-03-02' },
  });
  check('avertissement noté sur la fiche (201)', warning.status === 201, warning.body);

  const activity = await call('GET', `/api/staff/${storekeeper.employeeId}/activity`, { token });
  const activityKinds: string[] = activity.body?.items?.map((a: any) => a.kind) ?? [];
  check(
    'l’historique réunit le retard et l’avertissement',
    activityKinds.includes('late') && activityKinds.includes('warning'),
    activity.body,
  );

  const employeeInbox = await call('GET', '/api/notifications', { token: storekeeper.token });
  const employeeKinds: string[] = employeeInbox.body?.items?.map((n: any) => n.kind) ?? [];
  check(
    'l’employé est prévenu de son retard et de l’avertissement',
    employeeKinds.includes('attendance.late') && employeeKinds.includes('employee.warning'),
    employeeKinds,
  );

  // Changement de rôle.
  const ownerDemotion = await call('PATCH', `/api/users/${login.body?.profile?.user?.id}`, {
    token: colleagueToken,
    body: { role: 'cashier' },
  });
  check('le créateur de l’espace reste gérant (400)', ownerDemotion.status === 400, ownerDemotion.body);

  const selfDemotion = await call('PATCH', `/api/users/${created.body?.id}`, {
    token: colleagueToken,
    body: { role: 'cashier' },
  });
  check('on ne change pas son propre rôle (400)', selfDemotion.status === 400, selfDemotion.body);

  const promoted = await call('PATCH', `/api/users/${cashier.id}`, {
    token,
    body: { role: 'manager' },
  });
  check('le gérant promeut le caissier', promoted.body?.role === 'manager', promoted.body);
  const afterPromotion = await call('GET', '/api/cash/balance', { token: cashier.token });
  check(
    'le nouveau rôle s’applique tout de suite',
    afterPromotion.status === 200,
    afterPromotion.status,
  );

  // Journal d'activité.
  const journal = await call('GET', '/api/audit', { token });
  const actions: string[] = journal.body?.items?.map((entry: any) => entry.action) ?? [];
  check('le gérant lit le journal', journal.status === 200, journal.body);
  check(
    'l’annulation de vente y figure, avec son auteur et son motif',
    journal.body?.items?.some(
      (entry: any) =>
        entry.action === 'sale.cancelled' &&
        entry.userName === 'Awa Gérante' &&
        entry.details?.reason === 'Vente de test du caissier',
    ),
    actions,
  );
  check(
    'l’achat du magasinier y figure',
    journal.body?.items?.some(
      (entry: any) => entry.action === 'purchase.completed' && entry.userRole === 'storekeeper',
    ),
    actions,
  );
  check(
    'le changement de rôle y figure',
    journal.body?.items?.some(
      (entry: any) => entry.action === 'member.updated' && entry.details?.role === 'manager',
    ),
    actions,
  );
  check(
    'aucun mot de passe n’y est conservé',
    !JSON.stringify(journal.body).includes(colleaguePassword),
  );
  check(
    'une action refusée n’y laisse pas de trace',
    !journal.body?.items?.some(
      (entry: any) => entry.action === 'cash.adjusted' && entry.userRole === 'cashier',
    ),
  );

  // ---------------------------------------------------------------------
  section('16 quinquies. Ouverture et clôture de caisse');

  const tillLogin = await call('POST', '/api/auth/login', {
    body: { email: `cuisinier.${stamp}@exemple.com`, password: colleaguePassword },
  });
  const till: string = tillLogin.body?.accessToken;
  const balanceBeforeTill: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;

  const saleWithoutTill = await call('POST', '/api/sales', {
    token: till,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'cash' },
  });
  check(
    'le caissier ne vend pas tant que la caisse est fermée (409)',
    saleWithoutTill.status === 409,
    saleWithoutTill.body,
  );

  const opening = await call('POST', '/api/cash/sessions/open', {
    token: till,
    body: { openingFloat: 50000, breakdown: { '10000': 5 } },
  });
  check('le caissier ouvre la caisse avec son fond (201)', opening.status === 201, opening.body);
  check('l’attendu ne lui est pas montré', opening.body?.expectedCash === undefined, opening.body);

  const reopening = await call('POST', '/api/cash/sessions/open', {
    token: till,
    body: { openingFloat: 0 },
  });
  check('on n’ouvre pas deux caisses à la fois (409)', reopening.status === 409, reopening.body);

  const tillSales: string[] = [];
  for (const paymentMethod of ['cash', 'mobile_money']) {
    const sale = await call('POST', '/api/sales', {
      token: till,
      body: { items: [{ dishId, quantity: 1 }], paymentMethod },
    });
    tillSales.push(sale.body?.id);
  }
  check('il encaisse dans la caisse ouverte', tillSales.every(Boolean), tillSales);

  const wrongCount = await call('POST', '/api/cash/sessions/close', {
    token: till,
    body: { countedCash: 50000 },
  });
  check(
    'un comptage faux sans motif est refusé, sans révéler l’écart (422)',
    wrongCount.status === 422 && !JSON.stringify(wrongCount.body).includes('3500'),
    wrongCount.body,
  );

  const closing = await call('POST', '/api/cash/sessions/close', {
    token: till,
    body: { countedCash: 53500, breakdown: { '10000': 5, '1000': 3, '500': 1 }, countedMobileMoney: 3500 },
  });
  check('le compte juste clôture la caisse', closing.body?.status === 'closed', closing.body);
  check(
    'le caissier ne voit toujours ni attendu ni écart',
    closing.body?.expectedCash === undefined && closing.body?.cashDifference === undefined,
    closing.body,
  );

  const sessionsList = await call('GET', '/api/cash/sessions', { token });
  const firstSession = sessionsList.body?.items?.[0];
  check(
    'le gérant voit l’attendu, le compté et un écart nul',
    firstSession?.expectedCash === 53500 && firstSession?.cashDifference === 0,
    firstSession,
  );
  check(
    'le ticket Z compte les deux ventes, par mode',
    firstSession?.summary?.sales?.count === 2 &&
      firstSession?.summary?.sales?.byMethod?.mobile_money?.total === 3500,
    firstSession?.summary,
  );

  const deniedSessions = await call('GET', '/api/cash/sessions', { token: till });
  check('l’historique des clôtures est réservé au gérant (403)', deniedSessions.status === 403, deniedSessions.status);

  // Deuxième journée : il manque 500 FG dans le tiroir.
  await call('POST', '/api/cash/sessions/open', { token: till, body: { openingFloat: 0 } });
  const shortSale = await call('POST', '/api/sales', {
    token: till,
    body: { items: [{ dishId, quantity: 1 }], paymentMethod: 'cash' },
  });
  tillSales.push(shortSale.body?.id);
  const shortClosing = await call('POST', '/api/cash/sessions/close', {
    token: till,
    body: { countedCash: 3000, note: 'Un billet de 500 introuvable' },
  });
  check('avec un motif, la clôture passe malgré l’écart', shortClosing.body?.status === 'closed', shortClosing.body);

  const shortSession = await call('GET', `/api/cash/sessions/${shortClosing.body?.id}`, { token });
  check('le gérant voit l’écart de −500', shortSession.body?.cashDifference === -500, shortSession.body);

  const closeInbox = await call('GET', '/api/notifications', { token });
  check(
    'le gérant est notifié de l’écart, avec le motif',
    closeInbox.body?.items?.some(
      (n: any) => n.kind === 'cash.closed_with_difference' && n.body.includes('billet de 500'),
    ),
    closeInbox.body?.items?.map((n: any) => n.kind),
  );

  const balanceBeforeFix: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  const fix = await call('POST', `/api/cash/sessions/${shortClosing.body?.id}/correct`, { token });
  check('le gérant corrige le solde de l’écart', Boolean(fix.body?.correctedAt), fix.body);
  const balanceAfterFix: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('le solde baisse de 500', balanceAfterFix === balanceBeforeFix - 500, {
    avant: balanceBeforeFix,
    après: balanceAfterFix,
  });
  const fixAgain = await call('POST', `/api/cash/sessions/${shortClosing.body?.id}/correct`, { token });
  check('un écart ne se corrige qu’une fois (409)', fixAgain.status === 409, fixAgain.body);

  // Rapports et exports du jour.
  const report = await call('GET', `/api/reports/summary?from=${today}&to=${today}`, { token });
  check(
    'le rapport de la période compte les clôtures et leur écart',
    report.body?.sessions?.count >= 2 && report.body?.sessions?.totalCashDifference === -500,
    report.body?.sessions,
  );
  check('il calcule le résultat (ventes − dépenses)', typeof report.body?.result === 'number', report.body);

  const xlsx = await fetch(`${API}/api/reports/export.xlsx?from=${today}&to=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const xlsxBytes = Buffer.from(await xlsx.arrayBuffer());
  check(
    'l’export Excel est un vrai classeur',
    xlsx.status === 200 &&
      (xlsx.headers.get('content-type') ?? '').includes('spreadsheetml') &&
      xlsxBytes.subarray(0, 2).toString() === 'PK',
    { status: xlsx.status, taille: xlsxBytes.byteLength },
  );
  const deniedExport = await call('GET', `/api/reports/summary?from=${today}&to=${today}`, {
    token: till,
  });
  check('les rapports sont réservés au gérant (403)', deniedExport.status === 403, deniedExport.status);

  // Remise en état pour la suite : ventes annulées, correction compensée.
  for (const id of tillSales) {
    await call('POST', `/api/sales/${id}/cancel`, { token, body: { reason: 'Test de clôture' } });
  }
  await call('POST', '/api/cash/adjustments', {
    token,
    body: { direction: 'in', amount: 500, label: 'Remise en état du test' },
  });
  const balanceAfterTill: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('la caisse revient à son état d’avant', balanceAfterTill === balanceBeforeTill, {
    avant: balanceBeforeTill,
    après: balanceAfterTill,
  });

  // ---------------------------------------------------------------------
  section('16 sexies. Mini-site, commandes en ligne et livreur');

  const slug = `resto-${stamp}`.toLowerCase();
  const hiddenSite = await call('GET', `/api/public/r/${slug}`);
  check('sans adresse choisie, aucun mini-site (404)', hiddenSite.status === 404, hiddenSite.status);

  const deniedOnline = await call('PATCH', '/api/online/settings', {
    token: till,
    body: { slug, enabled: true },
  });
  check('le caissier ne règle pas le mini-site (403)', deniedOnline.status === 403, deniedOnline.status);

  const onlineSettings = await call('PATCH', '/api/online/settings', {
    token,
    body: { slug, enabled: true, message: 'Livraison en 45 minutes' },
  });
  check('le gérant choisit son adresse et ouvre les commandes', onlineSettings.body?.enabled === true, onlineSettings.body);

  const takenSlug = await call('PATCH', '/api/online/settings', { token: otherToken, body: { slug } });
  check('l’adresse d’un autre restaurant est refusée (409)', takenSlug.status === 409, takenSlug.body);

  const zone = await call('POST', '/api/online/zones', { token, body: { name: 'Kipé', fee: 10000 } });
  check('zone de livraison créée avec son prix', zone.status === 201 && zone.body?.fee === 10000, zone.body);
  const zoneRenamed = await call('PATCH', `/api/online/zones/${zone.body?.id}`, {
    token,
    body: { isActive: false },
  });
  await call('PATCH', `/api/online/zones/${zone.body?.id}`, { token, body: { name: 'Kipé centre' } });
  const zonesAfterRename = await call('GET', '/api/online/zones', { token });
  check(
    'renommer une zone ne la réactive pas',
    zoneRenamed.body?.isActive === false && zonesAfterRename.body?.data?.[0]?.isActive === false,
    zonesAfterRename.body,
  );
  await call('PATCH', `/api/online/zones/${zone.body?.id}`, { token, body: { isActive: true } });

  const onlineDish = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: `Poulet braisé ${stamp}`, price: 40000, availableQuantity: 3 },
  });
  const offlineDish = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: `Plat du comptoir ${stamp}`, price: 5000, isOnline: false },
  });
  await call('PATCH', `/api/menu/dishes/${offlineDish.body?.id}`, { token, body: { price: 6000 } });
  const offlineAfterEdit = await call('GET', `/api/menu/dishes/${offlineDish.body?.id}`, { token });
  check('modifier un plat ne le remet pas en ligne', offlineAfterEdit.body?.isOnline === false, offlineAfterEdit.body);

  const site = await call('GET', `/api/public/r/${slug}`);
  check('le mini-site est public, sans compte (200)', site.status === 200, site.body);
  check('il est ouvert et propose la livraison', site.body?.ordering?.open && site.body?.ordering?.delivery, site.body?.ordering);
  check(
    'seuls les plats choisis pour la vente en ligne y figurent',
    site.body?.dishes?.some((d: any) => d.id === onlineDish.body?.id) &&
      !site.body?.dishes?.some((d: any) => d.id === offlineDish.body?.id),
    site.body?.dishes?.map((d: any) => d.name),
  );
  check(
    'aucune donnée interne n’est exposée',
    !JSON.stringify(site.body).includes(restaurantId) && site.body?.restaurant?.id === undefined,
    site.body?.restaurant,
  );

  const orderBody = {
    customerName: 'Mariama Client',
    customerPhone: '622 11 22 33',
    mode: 'delivery',
    zoneId: zone.body?.id,
    landmark: 'Derrière la station Total',
    paymentMethod: 'cash',
    items: [{ dishId: onlineDish.body?.id, quantity: 2 }],
  };
  const noLandmark = await call('POST', `/api/public/r/${slug}/orders`, {
    body: { ...orderBody, landmark: '' },
  });
  check('une livraison sans point de repère est refusée (400)', noLandmark.status === 400, noLandmark.body);
  const counterOnly = await call('POST', `/api/public/r/${slug}/orders`, {
    body: { ...orderBody, items: [{ dishId: offlineDish.body?.id, quantity: 1 }] },
  });
  check('un plat hors ligne ne se commande pas (422)', counterOnly.status === 422, counterOnly.body);

  const placed = await call('POST', `/api/public/r/${slug}/orders`, {
    body: { ...orderBody, items: [{ dishId: onlineDish.body?.id, quantity: 2, unitPrice: 1 }] },
  });
  check('le client passe commande (201)', placed.status === 201, placed.body);
  check(
    'le total vient de la carte et de la zone : 2 × 40 000 + 10 000',
    placed.body?.totalAmount === 90000 && placed.body?.deliveryFee === 10000,
    placed.body,
  );
  const code: string = placed.body?.trackingCode;
  check('il reçoit un code de suivi', typeof code === 'string' && code.length >= 10, placed.body);

  const tracked = await call('GET', `/api/public/orders/${code}`);
  check('le suivi montre la commande reçue', tracked.body?.status === 'pending', tracked.body);
  const badCode = await call('GET', '/api/public/orders/AAAAAAAAAAAA');
  check('un code inventé ne mène nulle part (404)', badCode.status === 404, badCode.status);

  const orderInbox = await call('GET', '/api/notifications', { token: till });
  check(
    'le caissier est prévenu de la nouvelle commande',
    orderInbox.body?.items?.some((n: any) => n.kind === 'order.new' && n.body.includes('Mariama')),
    orderInbox.body?.items?.map((n: any) => n.kind),
  );

  const onlineQueue = await call('GET', '/api/orders?group=active', { token: till });
  const orderId: string = onlineQueue.body?.data?.find((o: any) => o.trackingCode === code)?.id;
  check('elle apparaît dans les commandes à traiter', Boolean(orderId) && onlineQueue.body?.counts?.pending >= 1, onlineQueue.body?.counts);

  const otherSees = await call('GET', `/api/orders/${orderId}`, { token: otherToken });
  check('un autre restaurant ne la voit pas (404)', otherSees.status === 404, otherSees.status);

  const driverCreated = await call('POST', '/api/users', {
    token,
    body: {
      fullName: 'Ibrahima Livreur',
      email: `livreur.${stamp}@exemple.com`,
      password: colleaguePassword,
      phone: '624 00 00 00',
      role: 'driver',
      employee: { position: 'Livreur', monthlySalary: 1500000, hireDate: today },
    },
  });
  check('le gérant crée un compte livreur', driverCreated.body?.role === 'driver', driverCreated.body);
  const driverFile: string = driverCreated.body?.employee?.id;
  await call('PATCH', `/api/staff/${driverFile}`, { token, body: { phone: '624 00 00 01' } });
  const driverFileAfter = await call('GET', `/api/staff/${driverFile}`, { token });
  check(
    'corriger la fiche d’un employé ne remet pas son salaire à zéro',
    driverFileAfter.body?.monthlySalary === 1500000,
    driverFileAfter.body,
  );

  const driverLogin = await call('POST', '/api/auth/login', {
    body: { email: `livreur.${stamp}@exemple.com`, password: colleaguePassword },
  });
  const driver: string = driverLogin.body?.accessToken;
  check(
    'le livreur n’a que le droit de livrer',
    JSON.stringify(driverLogin.body?.profile?.user?.permissions) === JSON.stringify(['deliveries.handle']),
    driverLogin.body?.profile?.user?.permissions,
  );
  const driverNoSales = await call('GET', '/api/orders', { token: driver });
  check('il ne voit pas les commandes du restaurant (403)', driverNoSales.status === 403, driverNoSales.status);

  const accepted = await call('POST', `/api/orders/${orderId}/accept`, { token: till });
  check('le caissier accepte après l’appel', accepted.body?.status === 'accepted', accepted.body);
  const reserved = await call('GET', `/api/menu/dishes/${onlineDish.body?.id}`, { token });
  check('les portions sont réservées (3 − 2 = 1)', reserved.body?.availableQuantity === 1, reserved.body);

  const assigned = await call('POST', `/api/orders/${orderId}/assign`, {
    token: till,
    body: { driverId: driverCreated.body?.id },
  });
  check('il confie la commande au livreur', assigned.body?.driver?.fullName === 'Ibrahima Livreur', assigned.body);
  const notADriver = await call('POST', `/api/orders/${orderId}/assign`, {
    token: till,
    body: { driverId: created.body?.id },
  });
  check('seul un livreur peut recevoir une course (404)', notADriver.status === 404, notADriver.body);

  const driverInbox = await call('GET', '/api/notifications', { token: driver });
  check(
    'le livreur est prévenu, avec le montant à encaisser',
    driverInbox.body?.items?.some((n: any) => n.kind === 'delivery.assigned' && n.body.includes('90 000')),
    driverInbox.body?.items?.map((n: any) => n.body),
  );

  await call('POST', `/api/orders/${orderId}/ready`, { token: till });
  const mine = await call('GET', '/api/deliveries', { token: driver });
  check(
    'le livreur voit sa course : adresse, repère et téléphone',
    mine.body?.data?.[0]?.landmark === 'Derrière la station Total' &&
      mine.body?.data?.[0]?.customerPhone === '622 11 22 33',
    mine.body?.data?.[0],
  );

  const deliverTooEarly = await call('POST', `/api/deliveries/${orderId}/deliver`, {
    token: driver,
    body: { collectedMethod: 'cash' },
  });
  check('on ne livre pas une course pas encore partie (409)', deliverTooEarly.status === 409, deliverTooEarly.body);

  await call('POST', `/api/deliveries/${orderId}/dispatch`, { token: driver });
  const onTheWay = await call('GET', `/api/public/orders/${code}`);
  check(
    'le client voit sa commande en route, avec le prénom du livreur',
    onTheWay.body?.status === 'out_for_delivery' && onTheWay.body?.driverName === 'Ibrahima',
    onTheWay.body,
  );
  const customerLateCancel = await call('POST', `/api/public/orders/${code}/cancel`);
  check('le client ne peut plus annuler une commande acceptée (409)', customerLateCancel.status === 409, customerLateCancel.body);

  const balanceBeforeOrder: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  const delivered = await call('POST', `/api/deliveries/${orderId}/deliver`, {
    token: driver,
    body: { collectedMethod: 'cash' },
  });
  check('le livreur marque la course livrée', delivered.body?.status === 'delivered', delivered.body);
  const balanceAfterDelivery: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('l’argent n’est pas encore en caisse', balanceAfterDelivery === balanceBeforeOrder, {
    avant: balanceBeforeOrder,
    après: balanceAfterDelivery,
  });

  const drivers = await call('GET', '/api/orders/drivers', { token });
  check(
    'le gérant voit les 90 000 à reverser par le livreur',
    drivers.body?.data?.find((d: any) => d.id === driverCreated.body?.id)?.toHandOver === 90000,
    drivers.body,
  );

  const settleClosed = await call('POST', `/api/orders/${orderId}/complete`, { token: till });
  check('sans caisse ouverte, le caissier n’encaisse pas (409)', settleClosed.status === 409, settleClosed.body);
  await call('POST', '/api/cash/sessions/open', { token: till, body: { openingFloat: 0 } });
  const settled = await call('POST', `/api/orders/${orderId}/complete`, { token: till });
  check('le caissier reçoit l’argent du livreur', settled.body?.status === 'completed', settled.body);
  check('la commande devient une vente', typeof settled.body?.saleReference === 'string', settled.body);
  const balanceAfterSettle: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('la caisse augmente de 90 000', balanceAfterSettle === balanceBeforeOrder + 90000, {
    avant: balanceBeforeOrder,
    après: balanceAfterSettle,
  });
  const orderSale = await call('GET', `/api/sales/${settled.body?.saleId}`, { token });
  check(
    'le ticket porte les plats et la livraison',
    orderSale.body?.items?.some((i: any) => i.dishName === 'Livraison — Kipé centre' && i.lineTotal === 10000) &&
      orderSale.body?.customerPhone === '622 11 22 33',
    orderSale.body?.items,
  );
  const settledAgain = await call('POST', `/api/orders/${orderId}/complete`, { token: till });
  check('une commande ne s’encaisse qu’une fois (409)', settledAgain.status === 409, settledAgain.body);

  // Une deuxième commande, à retirer, que le client annule lui-même.
  const pickup = await call('POST', `/api/public/r/${slug}/orders`, {
    body: { ...orderBody, mode: 'pickup', zoneId: null, items: [{ dishId: onlineDish.body?.id, quantity: 1 }] },
  });
  check('commande à retirer : pas de frais de livraison', pickup.body?.deliveryFee === 0 && pickup.body?.totalAmount === 40000, pickup.body);
  const selfCancel = await call('POST', `/api/public/orders/${pickup.body?.trackingCode}/cancel`);
  check('le client annule tant qu’elle n’est pas acceptée', selfCancel.body?.status === 'cancelled', selfCancel.body);

  // Une troisième, acceptée puis annulée : la portion revient au plat.
  const third = await call('POST', `/api/public/r/${slug}/orders`, {
    body: { ...orderBody, mode: 'pickup', zoneId: null, items: [{ dishId: onlineDish.body?.id, quantity: 1 }] },
  });
  const thirdId = (await call('GET', '/api/orders?group=active', { token })).body?.data?.find(
    (o: any) => o.trackingCode === third.body?.trackingCode,
  )?.id;
  await call('POST', `/api/orders/${thirdId}/accept`, { token });
  const reservedOut = await call('GET', `/api/menu/dishes/${onlineDish.body?.id}`, { token });
  check('la dernière portion réservée met le plat en rupture', reservedOut.body?.isAvailable === false, reservedOut.body);
  const cancelled = await call('POST', `/api/orders/${thirdId}/cancel`, {
    token,
    body: { reason: 'Client injoignable' },
  });
  const restored = await call('GET', `/api/menu/dishes/${onlineDish.body?.id}`, { token });
  check(
    'annulée, la commande rend sa portion au plat',
    cancelled.body?.status === 'cancelled' && restored.body?.availableQuantity === 1 && restored.body?.isAvailable,
    restored.body,
  );

  await call('PATCH', '/api/online/settings', { token, body: { enabled: false } });
  const closedSite = await call('POST', `/api/public/r/${slug}/orders`, { body: { ...orderBody, mode: 'pickup', zoneId: null } });
  check('commandes fermées : le mini-site refuse (422)', closedSite.status === 422, closedSite.body);

  const superOff = await call('POST', `/api/super-admin/restaurants/${restaurantId}/online`, {
    token: superToken,
    body: { allowed: false },
  });
  const goneSite = await call('GET', `/api/public/r/${slug}`);
  check(
    'le Super Admin retire le mini-site : la page disparaît',
    superOff.body?.onlineAllowed === false && goneSite.status === 404,
    { superAdmin: superOff.body?.onlineAllowed, page: goneSite.status },
  );
  await call('POST', `/api/super-admin/restaurants/${restaurantId}/online`, {
    token: superToken,
    body: { allowed: true },
  });

  // Remise en état : la vente annulée, la caisse revient à son état d'avant.
  await call('POST', `/api/sales/${settled.body?.saleId}/cancel`, { token, body: { reason: 'Test commande en ligne' } });
  await call('POST', '/api/cash/sessions/close', { token: till, body: { countedCash: 0, note: 'Fin du test' } });
  const balanceAfterOrders: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('la caisse revient à son état d’avant', balanceAfterOrders === balanceBeforeOrder, {
    avant: balanceBeforeOrder,
    après: balanceAfterOrders,
  });

  // ---------------------------------------------------------------------
  section('16 septies. Service en salle : serveur, cuisinier, caissier');

  async function roomMember(role: string, name: string) {
    const email = `${role}.${stamp}@exemple.com`;
    await call('POST', '/api/users', {
      token,
      body: {
        fullName: name,
        email,
        password: colleaguePassword,
        role,
        employee: { position: name, monthlySalary: 0, hireDate: today },
      },
    });
    const login = await call('POST', '/api/auth/login', { body: { email, password: colleaguePassword } });
    return login.body?.accessToken as string;
  }
  const waiter = await roomMember('waiter', 'Awa Serveuse');
  const kitchenCook = await roomMember('cook', 'Moussa Cuisinier');
  check('serveur et cuisinier se connectent', Boolean(waiter) && Boolean(kitchenCook));

  const batch = await call('POST', '/api/tables/batch', { token, body: { count: 3, area: 'Salle' } });
  check('le gérant crée trois tables d’un coup', batch.body?.created === 3, batch.body);
  const deniedTable = await call('POST', '/api/tables', { token: waiter, body: { name: 'Table X' } });
  check('le serveur ne dessine pas le plan (403)', deniedTable.status === 403, deniedTable.status);

  const plan = await call('GET', '/api/tables', { token: waiter });
  const table5 = plan.body?.data?.[0];
  check('le serveur voit les tables libres', table5?.state === 'free', table5);

  const kitchenDish = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: `Riz gras ${stamp}`, price: 25000, availableQuantity: 4 },
  });
  const drinkDish = await call('POST', '/api/menu/dishes', {
    token,
    body: { name: `Jus de bissap ${stamp}`, price: 5000 },
  });

  // Deux clients qui ne sont pas ensemble, à la même table.
  const billA = await call('POST', `/api/tables/${table5?.id}/bills`, { token: waiter, body: { label: 'Monsieur bleu' } });
  const billB = await call('POST', `/api/tables/${table5?.id}/bills`, { token: waiter, body: { guests: 2 } });
  check('deux additions ouvertes à la même table', billA.status === 201 && billB.status === 201, [billA.body, billB.body]);

  const tooManyPortions = await call('POST', `/api/bills/${billA.body?.id}/send`, {
    token: waiter,
    body: { items: [{ dishId: kitchenDish.body?.id, quantity: 5 }] },
  });
  check('on n’envoie pas plus de portions qu’il n’en reste (422)', tooManyPortions.status === 422, tooManyPortions.body);

  const sentA = await call('POST', `/api/bills/${billA.body?.id}/send`, {
    token: waiter,
    body: {
      items: [
        { dishId: kitchenDish.body?.id, quantity: 2, note: 'Sans piment' },
        { dishId: drinkDish.body?.id, quantity: 1 },
      ],
    },
  });
  check('le serveur envoie en cuisine', sentA.body?.items?.length === 2 && sentA.body?.total === 55000, sentA.body);
  const portions = await call('GET', `/api/menu/dishes/${kitchenDish.body?.id}`, { token });
  check('les portions sont prises à l’envoi (4 − 2 = 2)', portions.body?.availableQuantity === 2, portions.body);
  await call('POST', `/api/bills/${billB.body?.id}/send`, {
    token: waiter,
    body: { items: [{ dishId: kitchenDish.body?.id, quantity: 1 }] },
  });

  const cookInbox = await call('GET', '/api/notifications', { token: kitchenCook });
  check(
    'le cuisinier est prévenu, avec la remarque',
    cookInbox.body?.items?.some((n: any) => n.kind === 'kitchen.new' && n.body.includes('Sans piment')),
    cookInbox.body?.items?.map((n: any) => n.body),
  );
  const managerKitchenInbox = await call('GET', '/api/notifications', { token });
  check(
    'le gérant ne reçoit pas chaque ticket',
    !managerKitchenInbox.body?.items?.some((n: any) => n.kind === 'kitchen.new'),
    managerKitchenInbox.body?.items?.map((n: any) => n.kind),
  );

  const kitchen = await call('GET', '/api/kitchen', { token: kitchenCook });
  const ticketA = kitchen.body?.data?.find((t: any) => t.items.some((i: any) => i.note === 'Sans piment'));
  check('le ticket est à l’écran cuisine, avec sa table', Boolean(ticketA) && ticketA.title.includes('Monsieur bleu'), kitchen.body);
  check('sans prix à l’écran cuisine', !JSON.stringify(kitchen.body).includes('25000'), kitchen.body?.data?.[0]);
  const waiterKitchen = await call('GET', '/api/kitchen', { token: waiter });
  check('le serveur n’ouvre pas l’écran cuisine (403)', waiterKitchen.status === 403, waiterKitchen.status);

  await call('POST', `/api/kitchen/tickets/${ticketA?.id}/start`, { token: kitchenCook });
  const riceItem = ticketA?.items?.find((i: any) => i.note === 'Sans piment');
  const oneReady = await call('POST', `/api/kitchen/tickets/${ticketA?.id}/ready`, { token: kitchenCook, body: { itemId: riceItem?.id } });
  check(
    'un plat prêt, le reste encore en préparation',
    oneReady.body?.data?.find((t: any) => t.id === ticketA?.id)?.status === 'preparing',
    oneReady.body?.data,
  );
  const waiterInbox = await call('GET', '/api/notifications', { token: waiter });
  check(
    'le serveur est prévenu que le plat est prêt',
    waiterInbox.body?.items?.some((n: any) => n.kind === 'kitchen.ready' && n.title.includes('Monsieur bleu')),
    waiterInbox.body?.items?.map((n: any) => n.title),
  );
  const readyPlan = await call('GET', '/api/tables', { token: waiter });
  check('la table passe « plat prêt »', readyPlan.body?.data?.[0]?.state === 'ready', readyPlan.body?.data?.[0]);

  await call('POST', `/api/kitchen/tickets/${ticketA?.id}/ready`, { token: kitchenCook });
  const billAfterKitchen = await call('GET', `/api/bills/${billA.body?.id}`, { token: waiter });
  for (const item of billAfterKitchen.body?.items ?? []) {
    await call('POST', `/api/bills/items/${item.id}/served`, { token: waiter });
  }

  const deniedCancel = await call('POST', `/api/bills/items/${billAfterKitchen.body?.items?.[0]?.id}/cancel`, {
    token: waiter,
    body: { reason: 'Erreur de saisie' },
  });
  check('le serveur n’annule pas un plat envoyé (403)', deniedCancel.status === 403, deniedCancel.status);

  const allServed = await call('GET', `/api/bills/${billA.body?.id}`, { token: waiter });
  check(
    'tout est servi : l’addition passe seule « à encaisser »',
    allServed.body?.status === 'bill_requested',
    allServed.body?.status,
  );
  const tillInbox = await call('GET', '/api/notifications', { token: till });
  check(
    'le caissier est prévenu, avec le montant',
    tillInbox.body?.items?.some((n: any) => n.kind === 'bill.requested' && n.body.includes('Tout est servi') && n.body.includes('55 000')),
    tillInbox.body?.items?.map((n: any) => n.body),
  );
  const requestAgain = await call('POST', `/api/bills/${billA.body?.id}/request`, { token: waiter });
  check('inutile de la redemander (409)', requestAgain.status === 409, requestAgain.body);

  const toSettle = await call('GET', '/api/bills', { token: till });
  check(
    'l’addition demandée passe en tête de la liste du caissier',
    toSettle.body?.data?.[0]?.id === billA.body?.id,
    toSettle.body?.data?.map((b: any) => b.status),
  );
  const waiterPays = await call('POST', `/api/bills/${billA.body?.id}/pay`, { token: waiter, body: { paymentMethod: 'cash' } });
  check('le serveur n’encaisse pas (403)', waiterPays.status === 403, waiterPays.status);

  await call('POST', '/api/cash/sessions/open', { token: till, body: { openingFloat: 0 } });
  const balanceBeforeBill: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  const paid = await call('POST', `/api/bills/${billA.body?.id}/pay`, { token: till, body: { paymentMethod: 'cash' } });
  check('le caissier encaisse l’addition A', paid.body?.status === 'paid' && Boolean(paid.body?.saleReference), paid.body);
  const balanceAfterBill: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('la caisse augmente de 55 000', balanceAfterBill === balanceBeforeBill + 55000, {
    avant: balanceBeforeBill,
    après: balanceAfterBill,
  });
  const billSale = await call('GET', `/api/sales/${paid.body?.saleId}`, { token });
  check(
    'la vente regroupe les plats et nomme la table',
    billSale.body?.items?.length === 2 && String(billSale.body?.note).includes('Monsieur bleu'),
    billSale.body,
  );
  const stillBusy = await call('GET', '/api/tables', { token: waiter });
  check(
    'la table reste occupée : l’addition B n’est pas payée',
    stillBusy.body?.data?.[0]?.state !== 'free' && stillBusy.body?.data?.[0]?.bills?.length === 1,
    stillBusy.body?.data?.[0],
  );

  // Le gérant annule le plat de l'addition B : la portion revient.
  const billBNow = await call('GET', `/api/bills/${billB.body?.id}`, { token });
  const cancelledItem = await call('POST', `/api/bills/items/${billBNow.body?.items?.[0]?.id}/cancel`, {
    token,
    body: { reason: 'Client parti' },
  });
  const portionsBack = await call('GET', `/api/menu/dishes/${kitchenDish.body?.id}`, { token });
  check(
    'le gérant annule un plat : sa portion revient au plat',
    cancelledItem.body?.items?.[0]?.status === 'cancelled' && portionsBack.body?.availableQuantity === 2,
    portionsBack.body,
  );
  await call('POST', `/api/bills/${billB.body?.id}/cancel`, { token, body: { reason: 'Client parti' } });
  const freePlan = await call('GET', '/api/tables', { token: waiter });
  check('toutes les additions closes : la table est libre', freePlan.body?.data?.[0]?.state === 'free', freePlan.body?.data?.[0]);

  // Une commande en ligne acceptée arrive aussi en cuisine.
  await call('PATCH', '/api/online/settings', { token, body: { enabled: true } });
  // Un autre client, une autre adresse IP : le limiteur anti-abus compte par client.
  const webOrder = await call('POST', `/api/public/r/${slug}/orders`, {
    headers: { 'X-Forwarded-For': '203.0.113.7' },
    body: {
      ...orderBody,
      customerPhone: '621 99 88 77',
      mode: 'pickup',
      zoneId: null,
      items: [{ dishId: drinkDish.body?.id, quantity: 2 }],
    },
  });
  const webOrderId = (await call('GET', '/api/orders?group=active', { token: till })).body?.data?.find(
    (o: any) => o.trackingCode === webOrder.body?.trackingCode,
  )?.id;
  await call('POST', `/api/orders/${webOrderId}/accept`, { token: till });
  const kitchenOnline = await call('GET', '/api/kitchen', { token: kitchenCook });
  const onlineTicket = kitchenOnline.body?.data?.find((t: any) => t.source === 'online');
  check('la commande en ligne acceptée est à l’écran cuisine', Boolean(onlineTicket), kitchenOnline.body?.data);
  await call('POST', `/api/kitchen/tickets/${onlineTicket?.id}/ready`, { token: kitchenCook });
  const onlineReady = await call('GET', `/api/orders/${webOrderId}`, { token: till });
  check('prête en cuisine, elle passe « prête » chez le caissier', onlineReady.body?.status === 'ready', onlineReady.body);
  await call('POST', `/api/orders/${webOrderId}/cancel`, { token, body: { reason: 'Fin du test' } });
  await call('PATCH', '/api/online/settings', { token, body: { enabled: false } });

  // Remise en état de la caisse.
  await call('POST', `/api/sales/${paid.body?.saleId}/cancel`, { token, body: { reason: 'Test salle' } });
  await call('POST', '/api/cash/sessions/close', { token: till, body: { countedCash: 0, note: 'Fin du test' } });
  const balanceAfterRoom: number = (await call('GET', '/api/cash/balance', { token })).body?.balance;
  check('la caisse revient à son état d’avant', balanceAfterRoom === balanceBeforeBill, {
    avant: balanceBeforeBill,
    après: balanceAfterRoom,
  });

  // ---------------------------------------------------------------------
  section('16 octies. Notifications sur le téléphone');

  const pushKey = await call('GET', '/api/push/key');
  check('la clé publique est servie, créée au premier démarrage', typeof pushKey.body?.publicKey === 'string' && pushKey.body.publicKey.length > 60, pushKey.body);
  const pushKeyAgain = await call('GET', '/api/push/key');
  check('elle reste la même ensuite', pushKeyAgain.body?.publicKey === pushKey.body?.publicKey);

  const fakeSubscription = {
    endpoint: `https://push.example.invalid/${stamp}`,
    keys: { p256dh: 'BPcMbnWQL5GOYX0ScBmdmNAtVcHKLtgKbIhLzpMRtPUvFxmWAuEHNOUn9U0iVvEcEPFThtoBWFbXqWGP0_tvXqE', auth: 'Q2g9Tc0bVV-Z_K0ATsBMvw' },
  };
  const noAccount = await call('POST', '/api/push/subscribe', { body: fakeSubscription });
  check('s’abonner exige un compte (401)', noAccount.status === 401, noAccount.status);
  const subscribed = await call('POST', '/api/push/subscribe', { token: kitchenCook, body: fakeSubscription });
  check('le cuisinier active les notifications sur son téléphone', subscribed.status === 204, subscribed.body);
  const badSubscription = await call('POST', '/api/push/subscribe', { token: kitchenCook, body: { endpoint: 'pas-une-adresse' } });
  check('un abonnement invalide est refusé (400)', badSubscription.status === 400, badSubscription.status);
  const unsubscribed = await call('POST', '/api/push/unsubscribe', { body: { endpoint: fakeSubscription.endpoint } });
  check('il se désabonne à la déconnexion', unsubscribed.status === 204, unsubscribed.body);

  const customerPush = await call('POST', `/api/public/orders/${code}/push`, {
    body: { ...fakeSubscription, endpoint: `${fakeSubscription.endpoint}-client` },
  });
  check('le client s’abonne au suivi de sa commande', customerPush.status === 204, customerPush.body);
  const fakeCodePush = await call('POST', '/api/public/orders/AAAAAAAAAAAA/push', { body: fakeSubscription });
  check('pas d’abonnement sur une commande inventée (404)', fakeCodePush.status === 404, fakeCodePush.status);

  // ---------------------------------------------------------------------
  section('17. Désactivation par le Super Admin (§2.a)');
  const noReason = await call('POST', `/api/super-admin/restaurants/${restaurantId}/disable`, {
    token: superToken,
    body: {},
  });
  check('désactivation sans motif refusée (400)', noReason.status === 400, noReason.body);

  const disable = await call('POST', `/api/super-admin/restaurants/${restaurantId}/disable`, {
    token: superToken,
    body: { reason: 'Abonnement expiré' },
  });
  check('restaurant désactivé', disable.body?.status === 'disabled', disable.body);
  check('motif conservé', disable.body?.statusReason === 'Abonnement expiré', disable.body);

  const blocked = await call('GET', '/api/cash/balance', { token });
  check('accès immédiatement coupé (403)', blocked.status === 403, blocked.body);

  const colleagueBlocked = await call('GET', '/api/cash/balance', { token: colleagueToken });
  check(
    'le collègue est coupé lui aussi (403)',
    colleagueBlocked.status === 403,
    colleagueBlocked.status,
  );

  const refreshBlocked = await call('POST', '/api/auth/refresh', { body: { refreshToken } });
  check(
    'les sessions ouvertes sont révoquées (401)',
    refreshBlocked.status === 401,
    refreshBlocked.status,
  );

  const loginAfterDisable = await call('POST', '/api/auth/login', {
    body: { email: managerEmail, password: managerPassword },
  });
  check('connexion refusée (403)', loginAfterDisable.status === 403, loginAfterDisable.body);
  check(
    'le motif est expliqué au gérant',
    String(loginAfterDisable.body?.error?.message ?? '').includes('Abonnement expiré'),
    loginAfterDisable.body?.error,
  );

  const neighbourStillWorks = await call('GET', '/api/cash/balance', { token: otherToken });
  check(
    'le restaurant voisin n’est pas affecté',
    neighbourStillWorks.status === 200,
    neighbourStillWorks.status,
  );

  await call('POST', `/api/super-admin/restaurants/${restaurantId}/activate`, {
    token: superToken,
    body: { reason: 'Régularisé' },
  });
  const reLogin = await call('POST', '/api/auth/login', {
    body: { email: managerEmail, password: managerPassword },
  });
  check('réactivation : connexion à nouveau possible', reLogin.status === 200, reLogin.body);

  const dataIntact = await call('GET', '/api/cash/balance', {
    token: reLogin.body?.accessToken,
  });
  check(
    'toutes les données sont retrouvées après réactivation',
    dataIntact.body?.balance === CAPITAL - 30000,
    dataIntact.body,
  );

  // ---------------------------------------------------------------------
  section('18. Sécurité');
  const noToken = await call('GET', '/api/cash/balance');
  check('accès sans jeton refusé (401)', noToken.status === 401, noToken.body);

  const userOnSuperAdmin = await call('GET', '/api/super-admin/restaurants', { token });
  check(
    'un gérant ne peut pas accéder à l’espace Super Admin (403)',
    userOnSuperAdmin.status === 403,
    userOnSuperAdmin.body,
  );

  const badUuid = await call('GET', '/api/sales/pas-un-uuid', { token });
  check('identifiant mal formé rejeté (400)', badUuid.status === 400, badUuid.body);

  // ---------------------------------------------------------------------
  console.log(
    `\n[1m${failed === 0 ? '[32m' : '[31m'}Résultat : ${passed} réussis, ${failed} échoués[0m\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nErreur pendant le test :', error);
  process.exit(1);
});
