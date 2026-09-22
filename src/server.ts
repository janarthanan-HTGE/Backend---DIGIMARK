import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { connectDatabase, disconnectDatabase } from './config/database';
import { errorHandler, notFound } from './middleware/errors';
import routes from './routes';
import { ensureDevelopmentAdmin } from './services/bootstrap';

export const app = express();

const configuredOrigins = process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [];
app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export async function startServer(): Promise<void> {
  await connectDatabase();
  await ensureDevelopmentAdmin();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`HTGE API listening on http://localhost:${port}/api`));
}

if (require.main === module) {
  startServer().catch(async (error: unknown) => {
    console.error('Unable to start HTGE API:', error);
    await disconnectDatabase();
    process.exit(1);
  });
}
