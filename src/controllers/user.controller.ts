import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Payment } from '../models/payment';
import { Project } from '../models/project';
import { User } from '../models/user';
import { HttpError } from '../utils/errors';
import { entityId, formatUser } from '../utils/serializers';
import { ensureEmail, ensureString } from '../utils/validation';

export async function getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await User.findById(req.auth?.userId);
  if (!user) throw new HttpError(404, 'User not found.');
  res.json({ success: true, data: formatUser(user) });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = await User.findById(req.auth?.userId);
  if (!user) throw new HttpError(404, 'User not found.');

  if (req.body.email !== undefined) user.email = ensureEmail(req.body.email);
  if (req.body.phone !== undefined) user.phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';

  const profile = user.profile || {};
  const profileFields = ['companyName', 'industry', 'website', 'bankName', 'accountNumber', 'ifscCode', 'branchName'] as const;
  for (const field of profileFields) {
    if (req.body[field] !== undefined) {
      profile[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : undefined;
    }
  }
  user.profile = profile;
  await user.save();
  res.json({ success: true, data: formatUser(user) });
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const currentPassword = ensureString(req.body.currentPassword, 'Current password');
  const newPassword = ensureString(req.body.newPassword, 'New password', 6);
  const user = await User.findById(req.auth?.userId).select('+passwordHash');
  if (!user) throw new HttpError(404, 'User not found.');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect.');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ success: true, message: 'Password updated successfully.' });
}

export async function getAllUsers(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, data: users.map((user) => formatUser(user)) });
}

export async function clientNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const projects = await Project.find({ client: req.auth?.userId }).sort({ updatedAt: -1 });
  const droppedProjectIds = projects
    .filter((project) => project.status === 'DROPPED')
    .map((project) => project._id);
  const refunds = droppedProjectIds.length
    ? await Payment.find({
      project: { $in: droppedProjectIds },
      type: 'REFUND',
      status: 'REFUNDED',
    }).select('project amount')
    : [];
  const refundsByProject = new Map(refunds.map((refund) => [entityId(refund.project), refund.amount]));
  const notifications: Array<Record<string, unknown>> = [];

  for (const project of projects) {
    const base = { timestamp: project.updatedAt, unread: true };
    if (project.status === 'PUBLISHED' && project.freelancers.length) {
      notifications.push({ ...base, id: `assignment-${project.id}`, title: 'Freelancer assigned', description: `A freelancer was assigned to "${project.title}".`, type: 'message' });
    }
    if (project.status === 'ONGOING') {
      notifications.push({ ...base, id: `ongoing-${project.id}`, title: 'Project in progress', description: `"${project.title}" is now in progress.`, type: 'info' });
    }
    if (project.status === 'COMPLETED') {
      notifications.push({ ...base, id: `completed-${project.id}`, title: 'Project completed', description: `"${project.title}" has been completed.`, type: 'success' });
    }
    if (project.status === 'DROP_REQUESTED') {
      notifications.push({ ...base, id: `drop-request-${project.id}`, title: 'Drop request pending', description: `Your request to drop "${project.title}" is awaiting review.`, type: 'alert' });
    }
    if (project.status === 'DROPPED') {
      const refundAmount = refundsByProject.get(project.id);
      const suffix = refundAmount !== undefined ? ` A refund of ₹${refundAmount.toLocaleString('en-IN')} was issued.` : '';
      notifications.push({ ...base, id: `dropped-${project.id}`, title: 'Project dropped', description: `"${project.title}" was dropped.${suffix}`, type: 'drop' });
    }
  }

  notifications.sort((left, right) => new Date(String(right.timestamp)).getTime() - new Date(String(left.timestamp)).getTime());
  res.json({ success: true, data: notifications.slice(0, 20) });
}
