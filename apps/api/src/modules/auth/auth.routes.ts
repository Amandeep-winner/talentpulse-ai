import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registerRequestSchema, loginRequestSchema } from '@talentpulse/shared';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { env } from '../../config/env';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again after 15 minutes',
    },
  },
});

const router = Router();

router.post('/register', authLimiter, validate({ body: registerRequestSchema }), (req, res, next) => {
  authController.register(req, res, next);
});

router.post('/login', authLimiter, validate({ body: loginRequestSchema }), (req, res, next) => {
  authController.login(req, res, next);
});

router.post('/refresh', (req, res, next) => {
  authController.refresh(req, res, next);
});

router.post('/logout', (req, res, next) => {
  authController.logout(req, res, next);
});

router.get('/me', authenticate, (req, res, next) => {
  authController.me(req, res, next);
});

export const authRoutes = router;
