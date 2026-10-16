import './loadEnv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { ensureSchema } from './services/db';
import { migrateLegacyDataIfNeeded } from './services/legacyDataMigration';
import { errorHandler } from './middleware/errorHandler';
import { postsRouter } from './routes/posts';
import { subscribersRouter } from './routes/subscribers';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { aiRouter } from './routes/ai';
import { healthIndexRouter } from './routes/healthIndex';
import { botRouter } from './routes/bot';
import { startGenerationScheduler } from './services/generationScheduler';

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
const uploadRoot = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadRoot, { fallthrough: false }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ecashengine-backend', time: new Date().toISOString() });
});
app.use('/api/posts', postsRouter);
app.use('/api/bot/v1', botRouter);
app.use('/api/subscribe', subscribersRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/ai', aiRouter);
app.use('/api/health-index', healthIndexRouter);
app.use(errorHandler);

async function main() {
  await ensureSchema();
  await migrateLegacyDataIfNeeded();
  startGenerationScheduler();
  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
