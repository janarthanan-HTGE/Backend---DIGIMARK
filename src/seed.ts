import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from './config/database';
import { ensureDevelopmentAdmin } from './services/bootstrap';

async function seed(): Promise<void> {
  await connectDatabase();
  await ensureDevelopmentAdmin();
  console.log('Seed complete. The configured development admin is ready to sign in.');
}

seed()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => disconnectDatabase());
