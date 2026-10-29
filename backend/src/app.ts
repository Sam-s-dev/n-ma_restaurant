import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/pool';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  // Render place l'application derrière un proxy : sans cela, `req.ip`
  // renvoie l'IP du proxy et le limiteur de débit devient inopérant.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Sonde de santé utilisée par Render pour vérifier le conteneur.
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'API de gestion de restaurant',
      version: '1.0.0',
      documentation: '/api',
    });
  });

  // Carte des routes, pratique pendant le développement de l'app mobile.
  app.get('/api', (_req, res) => {
    res.json({
      superAdmin: '/api/super-admin',
      auth: '/api/auth',
      restaurant: '/api/restaurant',
      users: '/api/users',
      staff: '/api/staff',
      menu: '/api/menu',
      stock: '/api/stock',
      cash: '/api/cash',
      sales: '/api/sales',
      customers: '/api/customers',
      credits: '/api/credits',
      expenses: '/api/expenses',
      dashboard: '/api/dashboard',
      media: '/api/media',
      online: '/api/online',
      orders: '/api/orders',
      deliveries: '/api/deliveries',
      public: '/api/public',
      tables: '/api/tables',
      bills: '/api/bills',
      kitchen: '/api/kitchen',
    });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
