import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/user';
import { HttpError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: UserRole;
  };
}

interface TokenPayload extends jwt.JwtPayload {
  userId: string;
  role: UserRole;
}

function jwtSecret(): string {
  return process.env.JWT_SECRET || 'development-only-change-this-secret';
}

export function signAccessToken(userId: string, role: UserRole): string {
  return jwt.sign({ userId, role }, jwtSecret(), { expiresIn: '7d' });
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new HttpError(401, 'Authentication is required.');
    }

    const decoded = jwt.verify(token, jwtSecret()) as TokenPayload;
    if (!decoded.userId || !decoded.role) {
      throw new HttpError(401, 'Invalid authentication token.');
    }

    req.auth = { userId: decoded.userId, role: decoded.role };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Invalid or expired authentication token.'));
  }
}

export function allowRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new HttpError(403, 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
