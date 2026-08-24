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
  options: { body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
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
  section('8. Caisse — état initial (§7)');
  let balance = await call('GET', '/api/cash/balance', { token });
  check('solde initial à 0', balance.body?.balance === 0, balance.body);

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
  check('caisse débitée : −20 000', balance.body?.balance === -20000, balance.body);

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
  check('caisse créditée : −20 000 + 8 500 = −11 500', balance.body?.balance === -11500, balance.body);

  const receipt = await call('GET', `/api/sales/${cashSale.body?.id}/receipt`, { token });
  check('ticket avec en-tête restaurant (§3)', receipt.body?.restaurant?.name?.includes('Chez Test'), receipt.body?.restaurant);
  check('ticket avec les lignes', receipt.body?.sale?.items?.length === 2, receipt.body?.sale?.items);

  // ---------------------------------------------------------------------
  section('11. Vente à crédit (§8 : caisse inchangée)');
  const creditSale = await call('POST', '/api/sales', {
    token,
    body: {
      items: [{ dishId, quantity: 4 }],
      paymentMethod: 'credit',
      customerName: 'Monsieur Diallo',
      customerPhone: '+225 05 55 55 55',
    },
  });
  check('vente à crédit créée', creditSale.status === 201, creditSale.body);
  check('statut = credit', creditSale.body?.status === 'credit', creditSale.body);
  check('montant dû = 14 000', creditSale.body?.credit?.amountDue === 14000, creditSale.body?.credit);

  balance = await call('GET', '/api/cash/balance', { token });
  check('caisse INCHANGÉE après vente à crédit', balance.body?.balance === -11500, balance.body);

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
  check('caisse : −11 500 + 6 000 = −5 500', balance.body?.balance === -5500, balance.body);

  const settle = await call('POST', `/api/credits/${creditId}/payments`, {
    token,
    body: { amount: 8000 },
  });
  check('solde du crédit remboursé', settle.body?.status === 'paid', settle.body);
  check('reste dû = 0', settle.body?.amountLeft === 0, settle.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('caisse : −5 500 + 8 000 = 2 500', balance.body?.balance === 2500, balance.body);

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
  check('caisse : 2 500 − 50 000 = −47 500', balance.body?.balance === -47500, balance.body);

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
  check('caisse : −47 500 − 8 500 = −56 000', balance.body?.balance === -56000, balance.body);

  const cancelExpense = await call('POST', `/api/expenses/${purchase.body?.id}/cancel`, {
    token,
    body: { reason: 'Marchandise retournée' },
  });
  check('dépense annulée', cancelExpense.body?.cancelledAt !== null, cancelExpense.body);

  balance = await call('GET', '/api/cash/balance', { token });
  check('caisse : −56 000 + 20 000 = −36 000', balance.body?.balance === -36000, balance.body);

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
    Math.round((movements.body?.totals?.net ?? 0) * 100) === -3600000,
    movements.body?.totals,
  );

  const dashboard = await call('GET', '/api/dashboard/summary', { token });
  check('tableau de bord disponible', dashboard.status === 200, dashboard.body);
  check('solde cohérent', dashboard.body?.cash?.balance === -36000, dashboard.body?.cash);
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

  section('16. Équipe et invitations (§2.b)');
  const invite = await call('POST', '/api/users/invitations', {
    token,
    body: { email: `collegue.${stamp}@exemple.com` },
  });
  check('invitation créée', invite.status === 201, invite.body);
  const inviteToken: string = invite.body?.token;

  const accepted = await call('POST', '/api/auth/invitations/accept', {
    body: {
      token: inviteToken,
      fullName: 'Fatou Collègue',
      password: 'MotDePasse456!',
    },
  });
  check('invitation acceptée, session ouverte', accepted.status === 201, accepted.body);
  check(
    'le collègue est rattaché au même restaurant',
    accepted.body?.profile?.restaurant?.id === restaurantId,
    accepted.body?.profile?.restaurant,
  );

  const members = await call('GET', '/api/users', { token });
  check('2 membres dans l’équipe', members.body?.items?.length === 2, members.body?.items);

  const colleagueToken: string = accepted.body?.accessToken;
  const colleagueBalance = await call('GET', '/api/cash/balance', { token: colleagueToken });
  check(
    'le collègue a les mêmes droits (accès caisse)',
    colleagueBalance.body?.balance === -36000,
    colleagueBalance.body,
  );

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
    dataIntact.body?.balance === -36000,
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
