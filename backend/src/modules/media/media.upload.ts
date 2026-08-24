import multer from 'multer';
import { env } from '../../config/env';

/**
 * Les images sont conservées en mémoire puis écrites en base : le disque
 * de Render est éphémère, on ne peut pas s'appuyer dessus.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Seules les images sont acceptées.'));
      return;
    }
    cb(null, true);
  },
}).single('file');
