import { Router } from 'express';
import { requireUser } from '../middlewares/auth';
import { authRouter } from '../modules/auth/auth.routes';
import { cashRouter } from '../modules/cash/cash.routes';
import { creditsRouter } from '../modules/credits/credits.routes';
import { customersRouter } from '../modules/customers/customers.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { expensesRouter } from '../modules/expenses/expenses.routes';
import { mediaRouter } from '../modules/media/media.routes';
import { menuRouter } from '../modules/menu/menu.routes';
import { restaurantRouter } from '../modules/restaurant/restaurant.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { staffRouter } from '../modules/staff/staff.routes';
import { stockRouter } from '../modules/stock/stock.routes';
import { superAdminRouter } from '../modules/superadmin/superadmin.routes';
import { usersRouter } from '../modules/users/users.routes';

export const apiRouter = Router();

// --- Espaces d'authentification -----------------------------------------
apiRouter.use('/auth', authRouter);              // §2.b — restaurants
apiRouter.use('/super-admin', superAdminRouter); // §2.a — éditeur
apiRouter.use('/media', mediaRouter);            // images (lecture publique)

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
restaurantSpace.use('/cash', cashRouter);             // §7  Caisse
restaurantSpace.use('/sales', salesRouter);           // §8  Ventes
restaurantSpace.use('/customers', customersRouter);   // §8  Clients
restaurantSpace.use('/credits', creditsRouter);       // §8  Créances
restaurantSpace.use('/expenses', expensesRouter);     // §9  Dépenses
restaurantSpace.use('/dashboard', dashboardRouter);   // §10 Synthèse

apiRouter.use('/', restaurantSpace);
