import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { candidateFilterQuerySchema } from '@talentpulse/shared';
import { candidatesService } from './candidates.service';
import { ValidationError } from '../../lib/errors/AppError';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Invalid file type. Only PDF and plain text (.txt) files are allowed'));
    }
  },
});

export class CandidatesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = candidateFilterQuerySchema.parse(req.query);
      const result = await candidatesService.listCandidates(
        req.user!.organizationId,
        parsedQuery,
      );
      res.status(200).json({
        data: result.candidates,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidate = await candidatesService.getCandidate(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: candidate });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidate = await candidatesService.createCandidate(
        req.user!.organizationId,
        req.body,
      );
      res.status(201).json({ data: candidate });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidate = await candidatesService.updateCandidate(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
      );
      res.status(200).json({ data: candidate });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await candidatesService.deleteCandidate(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async uploadResume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await candidatesService.processResumeUpload(
        req.user!.organizationId,
        req.params.id as string,
        {
          buffer: req.file?.buffer,
          mimetype: req.file?.mimetype,
          pastedText: req.body?.resumeText,
        },
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const candidatesController = new CandidatesController();
