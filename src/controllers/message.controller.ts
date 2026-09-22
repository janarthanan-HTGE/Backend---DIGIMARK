import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Message } from '../models/message';
import { Project } from '../models/project';
import { User } from '../models/user';
import { HttpError } from '../utils/errors';
import { entityId, formatMessage } from '../utils/serializers';
import { ensureObjectId, ensureString } from '../utils/validation';

function canAccessProject(project: { client: unknown; freelancers: unknown[] }, req: AuthenticatedRequest): boolean {
  if (!req.auth) return false;
  if (req.auth.role === 'ADMIN') return true;
  if (req.auth.role === 'CLIENT') return entityId(project.client) === req.auth.userId;
  return project.freelancers.some((freelancer) => entityId(freelancer) === req.auth?.userId);
}

export async function listMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (!canAccessProject(project, req)) throw new HttpError(403, 'You do not have access to this conversation.');

  const filter: Record<string, unknown> = { project: project._id };
  if (typeof req.query.freelancerId === 'string' && req.query.freelancerId) {
    const freelancerId = ensureObjectId(req.query.freelancerId, 'Freelancer ID');
    filter.$or = [{ freelancer: freelancerId }, { freelancer: { $exists: false } }];
  }
  const messages = await Message.find(filter).sort({ createdAt: 1 }).populate('sender', 'fullName email role profile');
  res.json({ success: true, data: messages.map((message) => formatMessage(message)) });
}

export async function postMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (!canAccessProject(project, req)) throw new HttpError(403, 'You do not have access to this conversation.');

  const requestedSenderId = req.body.senderId ? String(req.body.senderId) : req.auth?.userId;
  const senderId = requestedSenderId || req.auth?.userId;
  if (!senderId) throw new HttpError(401, 'Authentication is required.');
  if (req.auth?.role !== 'ADMIN' && senderId !== req.auth?.userId) {
    throw new HttpError(403, 'You cannot send a message as another user.');
  }

  const sender = await User.findById(ensureObjectId(senderId, 'Sender ID'));
  if (!sender) throw new HttpError(400, 'Sender does not exist.');
  const freelancerId = req.body.freelancerId ? ensureObjectId(String(req.body.freelancerId), 'Freelancer ID') : undefined;
  if (freelancerId && !project.freelancers.some((freelancer) => entityId(freelancer) === String(freelancerId))) {
    throw new HttpError(400, 'The selected freelancer is not assigned to this project.');
  }

  const message = await Message.create({
    project: project._id,
    sender: sender._id,
    freelancer: freelancerId,
    content: ensureString(req.body.content, 'Message'),
  });
  await message.populate('sender', 'fullName email role profile');
  res.status(201).json({ success: true, data: formatMessage(message) });
}
