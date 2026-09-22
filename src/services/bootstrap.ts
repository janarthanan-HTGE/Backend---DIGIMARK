import bcrypt from 'bcryptjs';
import { User } from '../models/user';

export async function ensureDevelopmentAdmin(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const email = (process.env.ADMIN_EMAIL || 'adminhtge@gmail.org').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'password123';
  const existing = await User.findOne({ email });
  if (existing) return;

  await User.create({
    email,
    fullName: 'HTGE Administrator',
    passwordHash: await bcrypt.hash(password, 12),
    role: 'ADMIN',
    profile: {},
  });
  console.log(`Development admin created for ${email}. Set ADMIN_EMAIL and ADMIN_PASSWORD before deployment.`);
}
