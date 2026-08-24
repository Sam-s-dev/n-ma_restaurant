import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 propage déjà les rejets de promesses, mais on garde ce wrapper
 * explicite : il documente l'intention et protège d'un downgrade éventuel.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
