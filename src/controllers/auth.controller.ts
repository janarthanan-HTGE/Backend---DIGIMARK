import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthenticatedRequest, signAccessToken } from '../middleware/auth';
import { User } from '../models/user';
import { formatUser } from '../utils/serializers';
import { HttpError } from '../utils/errors';
import { ensureEmail, ensureString } from '../utils/validation';

function validPassword(value: unknown): string {
  const password = ensureString(value, 'Password', 6);
  if (password.length > 256) throw new HttpError(400, 'Password is too long.');
  return password;
}

export async function register(req: AuthenticatedRequest, res: Response): Promise<void> {
  const email = ensureEmail(req.body.email);
  const password = validPassword(req.body.password);
  const fullName = ensureString(req.body.fullName, 'Full name', 2);
  const companyName = ensureString(req.body.profile?.companyName ?? req.body.companyName, 'Company name', 2);

  const exists = await User.exists({ email });
  if (exists) throw new HttpError(409, 'An account with this email already exists.');

  const user = await User.create({
    email,
    fullName,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'CLIENT',
    profile: {
      companyName,
      industry: typeof req.body.profile?.industry === 'string' ? req.body.profile.industry.trim() : undefined,
      website: typeof req.body.profile?.website === 'string' ? req.body.profile.website.trim() : undefined,
    },
  });

  res.status(201).json({ token: signAccessToken(user.id, user.role), user: formatUser(user) });
}

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const email = ensureEmail(req.body.email);
  const password = validPassword(req.body.password);
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  res.json({ token: signAccessToken(user.id, user.role), user: formatUser(user) });
}

export async function me(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await User.findById(req.auth?.userId);
  if (!user) throw new HttpError(401, 'Your account no longer exists.');
  res.json(formatUser(user));
}
