import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { connectDatabase, disconnectDatabase } from './config/database';
import { errorHandler, notFound } from './middleware/errors';
import routes from './routes';

export const app = express();

const configuredOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://clientdigimark.vercel.app',
  'https://admindigimark.vercel.app',
  'http://clientdigimark.vercel.app',
  'http://admindigimark.vercel.app',
  ...configuredOrigins,
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: false,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export async function startServer(): Promise<void> {
  await connectDatabase();
  app.listen(3000, () => console.log('HTGE API listening on http://localhost:3000/api'));
}

if (require.main === module) {
  startServer().catch(async (error: unknown) => {
    console.error('Unable to start HTGE API:', error);
    await disconnectDatabase();
    process.exit(1);
  });
}
