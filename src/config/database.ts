import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
