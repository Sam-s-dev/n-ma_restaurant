import { Router } from 'express';
import { requireUser } from '../middlewares/auth';
import { auditRouter } from '../modules/audit/audit.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { cashRouter } from '../modules/cash/cash.routes';
import { creditsRouter } from '../modules/credits/credits.routes';
import { customersRouter } from '../modules/customers/customers.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { expensesRouter } from '../modules/expenses/expenses.routes';
import { mediaRouter } from '../modules/media/media.routes';
import { menuRouter } from '../modules/menu/menu.routes';
import { onlineRouter, publicRouter } from '../modules/online/online.routes';
import { deliveriesRouter, ordersRouter } from '../modules/orders/orders.routes';
import { kitchenRouter } from '../modules/kitchen/kitchen.routes';
import { billsRouter, tablesRouter } from '../modules/tables/tables.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { purchasesRouter } from '../modules/purchases/purchases.routes';
import { restaurantRouter } from '../modules/restaurant/restaurant.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { sessionsRouter } from '../modules/sessions/sessions.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { staffRouter } from '../modules/staff/staff.routes';
import { stockRouter } from '../modules/stock/stock.routes';
import { superAdminRouter } from '../modules/superadmin/superadmin.routes';
import { usersRouter } from '../modules/users/users.routes';

export const apiRouter = Router();

// --- Espaces d'authentification -----------------------------------------
apiRouter.use('/auth', authRouter);              // §2.b — restaurants
apiRouter.use('/super-admin', superAdminRouter); // §2.a — éditeur
apiRouter.use('/media', mediaRouter);            // images (lecture publique)
apiRouter.use('/public', publicRouter);          // mini-sites des restaurants

// --- Espace restaurant ---------------------------------------------------
// `requireUser` injecte le restaurant_id du jeton : chaque module ne voit
// que les données de son propre restaurant (§2.b, §12).
const restaurantSpace = Router();
restaurantSpace.use(requireUser);

restaurantSpace.use('/restaurant', restaurantRouter); // §3  Paramètres
restaurantSpace.use('/users', usersRouter);           // §2.b Équipe
restaurantSpace.use('/staff', staffRouter);           // §4  Personnel
restaurantSpace.use('/menu', menuRouter);             // §5  Menu
restaurantSpace.use('/stock', stockRouter);           // §6  Stock
restaurantSpace.use('/cash/sessions', sessionsRouter); // §7 Ouverture / clôture
restaurantSpace.use('/cash', cashRouter);             // §7  Caisse
restaurantSpace.use('/sales', salesRouter);           // §8  Ventes
restaurantSpace.use('/customers', customersRouter);   // §8  Clients
restaurantSpace.use('/credits', creditsRouter);       // §8  Créances
restaurantSpace.use('/expenses', expensesRouter);     // §9  Dépenses
restaurantSpace.use('/dashboard', dashboardRouter);   // §10 Synthèse
restaurantSpace.use('/audit', auditRouter);           // Journal d'activité
restaurantSpace.use('/notifications', notificationsRouter);
restaurantSpace.use('/purchases', purchasesRouter);   // Demandes d'achat
restaurantSpace.use('/reports', reportsRouter);       // Rapports et exports
restaurantSpace.use('/online', onlineRouter);         // Mini-site : réglages, zones
restaurantSpace.use('/orders', ordersRouter);         // Commandes en ligne
restaurantSpace.use('/deliveries', deliveriesRouter); // Courses du livreur
restaurantSpace.use('/tables', tablesRouter);         // Plan de salle
restaurantSpace.use('/bills', billsRouter);           // Additions des tables
restaurantSpace.use('/kitchen', kitchenRouter);       // Écran cuisine

apiRouter.use('/', restaurantSpace);
