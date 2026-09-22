import { Types } from 'mongoose';
import { HttpError } from './errors';

export function ensureString(value: unknown, field: string, minLength = 1): string {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}

export function ensureEmail(value: unknown): string {
  const email = ensureString(value, 'Email').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export function ensureObjectId(value: string, name = 'ID'): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new HttpError(400, `${name} is invalid.`);
  }
  return new Types.ObjectId(value);
}

export function parseMoney(value: unknown, field = 'Budget'): number {
  const amount = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, `${field} must be greater than zero.`);
  }
  return Math.round(amount * 100) / 100;
}

export function toPercentage(value: unknown): number {
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new HttpError(400, 'Completion percentage must be between 0 and 100.');
  }
  return Math.round(percentage);
}
