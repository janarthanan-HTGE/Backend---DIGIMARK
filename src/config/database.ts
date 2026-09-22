import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is required.');
  }

  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
