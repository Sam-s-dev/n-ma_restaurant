/**
 * Erreurs métier. Le gestionnaire d'erreurs global les traduit en réponses
 * HTTP ; toute autre exception devient un 500 sans détail exposé au client.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentification requise.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Accès refusé.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource = 'Ressource') =>
  new AppError(404, 'NOT_FOUND', `${resource} introuvable.`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'UNPROCESSABLE', message, details);

export const tooLarge = (message: string) =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);
