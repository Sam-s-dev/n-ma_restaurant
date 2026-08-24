import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.logLevel,
  // Ne jamais laisser fuir un mot de passe ou un token dans les logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      'token',
      '*.token',
    ],
    censor: '[masqué]',
  },
  transport: env.isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});
