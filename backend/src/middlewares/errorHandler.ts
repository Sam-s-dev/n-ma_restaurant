import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../core/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route inconnue : ${req.method} ${req.originalUrl}` },
  });
};

/** Codes PostgreSQL traduits en messages compréhensibles par le gérant. */
function fromPostgres(error: { code?: string; constraint?: string; detail?: string }) {
  switch (error.code) {
    case '23505': // unique_violation
      return new AppError(409, 'CONFLICT', 'Cet enregistrement existe déjà.', {
        constraint: error.constraint,
      });
    case '23503': // foreign_key_violation
      return new AppError(
        409,
        'CONFLICT',
        'Opération impossible : cet élément est lié à d’autres données.',
        { constraint: error.constraint },
      );
    case '23514': // check_violation
      return new AppError(422, 'UNPROCESSABLE', 'Données incohérentes refusées par la base.', {
        constraint: error.constraint,
      });
    case '22P02': // invalid_text_representation
      return new AppError(400, 'BAD_REQUEST', 'Identifiant ou valeur mal formée.');
    default:
      return null;
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof MulterError) {
    appError =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Fichier trop volumineux.')
        : new AppError(400, 'BAD_REQUEST', `Envoi de fichier invalide : ${err.message}`);
  } else {
    appError = fromPostgres(err as never) ?? new AppError(500, 'INTERNAL', 'Erreur serveur.');
  }

  if (appError.status >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'erreur non gérée');
  } else {
    logger.debug({ code: appError.code, path: req.originalUrl }, appError.message);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      ...(!env.isProduction && appError.status >= 500
        ? { debug: (err as Error)?.message }
        : {}),
    },
  });
};
