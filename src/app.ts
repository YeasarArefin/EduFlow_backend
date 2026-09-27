import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import helmet from 'helmet';
import { apiBasePath } from './config/http';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { passwordResetRateLimit } from './middleware/password-reset-rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import { healthRouter } from './routes/health.routes';
import { v1Router } from './routes/v1';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    })
  );
  app.use(express.json());
  app.post('/api/auth/request-password-reset', passwordResetRateLimit);
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(healthRouter);
  app.use(apiBasePath, v1Router);

  app.use(errorHandler);

  return app;
}
