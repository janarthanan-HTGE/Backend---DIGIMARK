import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth';
import { Payment } from '../models/payment';
import { PROJECT_STATUSES, Project } from '../models/project';
import { User } from '../models/user';
import { razorpayClient } from '../services/razorpay';
import { HttpError } from '../utils/errors';
import { entityId, formatProject } from '../utils/serializers';
import { ensureObjectId, ensureString, parseMoney, toPercentage } from '../utils/validation';

async function populatedProject(id: string) {
  return Project.findById(id)
    .populate('client', 'fullName email phone profile role walletBalance')
    .populate('freelancers', 'fullName email phone profile role');
}

function isProjectClient(project: { client: unknown }, userId: string): boolean {
  return entityId(project.client) === userId;
}

function isAssignedFreelancer(project: { freelancers: unknown[] }, userId: string): boolean {
  return project.freelancers.some((freelancer) => entityId(freelancer) === userId);
}

function assertProjectAccess(project: { client: unknown; freelancers: unknown[] }, request: AuthenticatedRequest): void {
  if (!request.auth) throw new HttpError(401, 'Authentication is required.');
  if (request.auth.role === 'ADMIN') return;
  if (request.auth.role === 'CLIENT' && isProjectClient(project, request.auth.userId)) return;
  if (request.auth.role === 'FREELANCER' && isAssignedFreelancer(project, request.auth.userId)) return;
  throw new HttpError(403, 'You do not have access to this project.');
}

function readAssets(body: Record<string, unknown>): Array<{ fileName: string; fileUrl: string }> {
  const assets: Array<{ fileName: string; fileUrl: string }> = [];
  const source = [body.sampleLinks, body.sampleFiles, body.assets];
  for (const group of source) {
    if (!Array.isArray(group)) continue;
    for (const candidate of group) {
      if (!candidate || typeof candidate !== 'object') continue;
      const value = candidate as Record<string, unknown>;
      const fileName = String(value.fileName ?? value.title ?? value.name ?? '').trim();
      let fileUrl = String(value.fileUrl ?? value.url ?? '').trim();
      if (!fileName && !fileUrl) continue;
      if (fileUrl && !/^(https?:|data:)/i.test(fileUrl)) fileUrl = `https://${fileUrl}`;
      assets.push({ fileName: fileName || 'Project reference', fileUrl: fileUrl || '#' });
    }
  }
  return assets;
}

export async function listProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
  const filter: Record<string, unknown> = {};
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  if (status) {
    if (!PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) throw new HttpError(400, 'Unknown project status.');
    filter.status = status;
  }

  if (req.auth?.role === 'CLIENT') filter.client = req.auth.userId;
  if (req.auth?.role === 'FREELANCER') filter.freelancers = req.auth.userId;
  if (req.auth?.role === 'ADMIN' && typeof req.query.clientId === 'string') filter.client = ensureObjectId(req.query.clientId, 'Client ID');
  if (req.auth?.role === 'ADMIN' && typeof req.query.freelancerId === 'string') filter.freelancers = ensureObjectId(req.query.freelancerId, 'Freelancer ID');

  const projects = await Project.find(filter)
    .sort({ createdAt: -1 })
    .populate('client', 'fullName email phone profile role walletBalance')
    .populate('freelancers', 'fullName email phone profile role');
  const payments = await Payment.find({ project: { $in: projects.map((project) => project._id) } }).sort({ createdAt: -1 });
  const paymentsByProject = new Map<string, typeof payments>();
  for (const payment of payments) {
    const projectPayments = paymentsByProject.get(entityId(payment.project)) || [];
    projectPayments.push(payment);
    paymentsByProject.set(entityId(payment.project), projectPayments);
  }
  res.json(projects.map((project) => formatProject(project, paymentsByProject.get(project.id) || [])));
}

export async function getProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await populatedProject(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  assertProjectAccess(project, req);
  const payments = await Payment.find({ project: project._id }).sort({ createdAt: -1 });
  res.json(formatProject(project, payments));
}

export async function createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'CLIENT') throw new HttpError(403, 'Only client accounts can publish projects.');
  const project = await Project.create({
    title: ensureString(req.body.title, 'Title', 2),
    description: ensureString(req.body.description, 'Description', 2),
    budget: parseMoney(req.body.budget),
    timeline: typeof req.body.timeline === 'string' ? req.body.timeline.trim() : '',
    client: ensureObjectId(req.auth.userId, 'Client ID'),
    assets: readAssets(req.body as Record<string, unknown>),
  });
  const populated = await populatedProject(project.id);
  res.status(201).json(formatProject(populated ?? project));
}

export async function assignFreelancers(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can assign freelancers.');
  if (!Array.isArray(req.body.freelancerIds)) throw new HttpError(400, 'freelancerIds must be an array.');
  const freelancerIds = req.body.freelancerIds.map((id: unknown) => ensureObjectId(String(id), 'Freelancer ID'));
  const count = await User.countDocuments({ _id: { $in: freelancerIds }, role: 'FREELANCER' });
  if (count !== freelancerIds.length) throw new HttpError(400, 'One or more selected freelancers do not exist.');

  const project = await Project.findByIdAndUpdate(req.params.id, { $addToSet: { freelancers: { $each: freelancerIds } } }, { new: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  const populated = await populatedProject(project.id);
  res.json({ success: true, data: formatProject(populated ?? project) });
}

export async function approveProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can approve projects.');
  const project = await Project.findByIdAndUpdate(req.params.id, { status: 'PUBLISHED' }, { new: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  res.json({ success: true, data: formatProject(project) });
}

export async function updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can update project status.');
  const status = ensureString(req.body.status, 'Status') as (typeof PROJECT_STATUSES)[number];
  if (!PROJECT_STATUSES.includes(status)) throw new HttpError(400, 'Unknown project status.');
  const project = await Project.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  res.json({ success: true, data: formatProject(project) });
}

export async function updateProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can update project progress.');
  const data: Record<string, unknown> = { completionPercentage: toPercentage(req.body.completionPercentage) };
  if (req.body.googleDriveLink !== undefined) data.googleDriveLink = String(req.body.googleDriveLink).trim();
  const project = await Project.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  res.json({ success: true, data: formatProject(project) });
}

export async function requestDrop(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (req.auth?.role !== 'ADMIN' && !(req.auth?.role === 'CLIENT' && isProjectClient(project, req.auth.userId))) {
    throw new HttpError(403, 'Only the project client can request a drop.');
  }
  if (project.status === 'COMPLETED' || project.status === 'DROPPED') throw new HttpError(400, 'This project can no longer be dropped.');
  if (project.status === 'PUBLISHED' && project.freelancers.length > 0) {
    throw new HttpError(400, 'Complete the 10% drop-fee payment before dropping this project.');
  }
  if (project.status === 'ONGOING') {
    throw new HttpError(400, 'Complete the 25% drop-fee payment before dropping this project.');
  }
  const hasNoApproaches = project.status === 'PUBLISHED' && project.freelancers.length === 0;
  project.status = 'DROP_REQUESTED';
  await project.save();
  res.json({
    success: true,
    message: hasNoApproaches ? 'Drop request submitted with no drop fee.' : 'Drop request submitted for administrator review.',
    data: formatProject(project),
  });
}

export async function payNoFeeDrop(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can pay drop refunds.');
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (project.status !== 'DROP_REQUESTED' || project.freelancers.length > 0) {
    throw new HttpError(400, 'Only a pending zero-approach drop can be paid here.');
  }

  const fee = await Payment.findOne({
    project: project._id,
    type: { $in: ['PENALTY_10', 'PENALTY_25'] },
    status: 'COMPLETED',
  });
  if (fee) throw new HttpError(400, 'This project has a paid drop fee and must use the normal refund action.');

  const existingRefund = await Payment.findOne({ project: project._id, type: 'REFUND' });
  if (existingRefund) {
    res.json({ success: true, message: 'The no-fee refund amount is already prepared.', data: formatProject(project) });
    return;
  }

  await Payment.create({
    project: project._id,
    user: project.client,
    amount: project.budget,
    type: 'REFUND',
    status: 'PENDING',
  });
  res.json({ success: true, message: 'Refund amount prepared. Release it to the client to complete the drop.', data: formatProject(project) });
}

export async function approveDrop(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can approve drop requests.');
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (project.status !== 'DROP_REQUESTED') throw new HttpError(400, 'This project does not have a pending drop request.');

  const escrow = await Payment.findOne({ project: project._id, type: 'ESCROW', status: 'COMPLETED' }).sort({ createdAt: -1 });
  const paidDropFee = await Payment.findOne({
    project: project._id,
    type: { $in: ['PENALTY_10', 'PENALTY_25'] },
    status: 'COMPLETED',
  }).sort({ createdAt: -1 });
  const penaltyPercent = paidDropFee?.type === 'PENALTY_25' ? 25 : paidDropFee ? 10 : 0;
  const preparedRefund = await Payment.findOne({ project: project._id, type: 'REFUND', status: 'PENDING' });
  let message: string;

  if (escrow) {
    const refundAmount = Math.round(escrow.amount * (1 - penaltyPercent / 100) * 100) / 100;
    const refund = await Payment.create({ project: project._id, user: project.client, amount: refundAmount, type: 'REFUND', status: 'PENDING' });
    if (escrow.razorpayPaymentId) {
      const razorpayRefund = await razorpayClient().payments.refund(escrow.razorpayPaymentId, { amount: Math.round(refundAmount * 100) });
      refund.status = 'REFUNDED';
      refund.razorpayRefundId = razorpayRefund.id;
    } else if (preparedRefund) {
      preparedRefund.status = 'REFUNDED';
      await preparedRefund.save();
      await User.findByIdAndUpdate(project.client, { $inc: { walletBalance: preparedRefund.amount } });
      message = `Project dropped with no drop fee. ₹${preparedRefund.amount.toLocaleString('en-IN')} refund released to the client.`;
    } else {
      refund.status = 'REFUNDED';
    }
    await refund.save();
    await User.findByIdAndUpdate(project.client, { $inc: { walletBalance: -refundAmount } });
    message = penaltyPercent > 0
      ? `Project dropped. A ${penaltyPercent}% drop fee was recorded and ${100 - penaltyPercent}% (₹${refundAmount.toLocaleString('en-IN')}) was refunded.`
      : `Project dropped with no drop fee. The full escrow amount (₹${refundAmount.toLocaleString('en-IN')}) was refunded.`;
  } else {
    message = penaltyPercent > 0
      ? `Project dropped. A ${penaltyPercent}% drop fee was recorded.`
      : 'Project dropped with no drop fee.';
  }

  project.status = 'DROPPED';
  await project.save();
  res.json({ success: true, message, data: formatProject(project) });
}

export async function completeProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.auth?.role !== 'ADMIN') throw new HttpError(403, 'Only administrators can complete projects.');
  const project = await Project.findByIdAndUpdate(req.params.id, { status: 'COMPLETED', completionPercentage: 100 }, { new: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  res.json({ success: true, data: formatProject(project) });
}

export async function rateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (req.auth?.role !== 'ADMIN' && !(req.auth?.role === 'CLIENT' && isProjectClient(project, req.auth.userId))) throw new HttpError(403, 'Only the project client can submit a rating.');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be a whole number between 1 and 5.');
  project.rating = rating;
  project.review = typeof req.body.review === 'string' ? req.body.review.trim() : '';
  await project.save();
  res.json({ success: true, data: formatProject(project) });
}

export async function addAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  assertProjectAccess(project, req);
  if (req.auth?.role === 'FREELANCER' && !isAssignedFreelancer(project, req.auth.userId)) throw new HttpError(403, 'You cannot add files to this project.');
  project.assets.push({ _id: new Types.ObjectId(), fileName: ensureString(req.body.fileName, 'File name'), fileUrl: ensureString(req.body.fileUrl, 'File URL'), createdAt: new Date() });
  await project.save();
  const asset = project.assets[project.assets.length - 1];
  res.status(201).json({ success: true, data: { id: entityId(asset), fileName: asset.fileName, fileUrl: asset.fileUrl, projectId: project.id, createdAt: asset.createdAt } });
}

export async function removeAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  if (req.auth?.role !== 'ADMIN' && !(req.auth?.role === 'CLIENT' && isProjectClient(project, req.auth.userId))) throw new HttpError(403, 'You cannot delete this file.');
  const assetId = ensureObjectId(req.params.assetId, 'Asset ID');
  const before = project.assets.length;
  project.assets = project.assets.filter((asset) => !asset._id.equals(assetId));
  if (before === project.assets.length) throw new HttpError(404, 'Asset not found.');
  await project.save();
  res.json({ success: true });
}
