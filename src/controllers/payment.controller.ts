import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Message } from '../models/message';
import { Payment, PaymentType } from '../models/payment';
import { Project } from '../models/project';
import { User } from '../models/user';
import { razorpayClient } from '../services/razorpay';
import { HttpError } from '../utils/errors';
import { entityId, formatProject } from '../utils/serializers';

function assertClientProject(project: { client: unknown }, req: AuthenticatedRequest): void {
  if (req.auth?.role === 'ADMIN') return;
  if (req.auth?.role !== 'CLIENT' || entityId(project.client) !== req.auth.userId) {
    throw new HttpError(403, 'Only the project client can manage its payments.');
  }
}

function paymentAmount(project: { budget: number }, type: PaymentType): number {
  if (type === 'ESCROW') return project.budget;
  const percentage = type === 'PENALTY_25' ? 25 : 10;
  return Math.round(project.budget * (percentage / 100) * 100) / 100;
}

function validPaymentType(value: unknown): PaymentType {
  if (value === 'ESCROW' || value === 'PENALTY_10' || value === 'PENALTY_25') return value;
  throw new HttpError(400, 'Payment type must be ESCROW, PENALTY_10, or PENALTY_25.');
}

function assertDropPaymentType(project: { status: string; freelancers: unknown[] }, type: PaymentType): void {
  if (type === 'PENALTY_10' && (project.status !== 'PUBLISHED' || project.freelancers.length === 0)) {
    throw new HttpError(400, 'A 10% drop fee is only required for published projects with approaches.');
  }
  if (type === 'PENALTY_25' && project.status !== 'ONGOING') {
    throw new HttpError(400, 'A 25% drop fee is only required for ongoing projects.');
  }
  if (type === 'ESCROW' && project.status !== 'PUBLISHED') {
    throw new HttpError(400, 'Escrow can only be paid for published projects.');
  }
}

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.body.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  assertClientProject(project, req);
  const type = validPaymentType(req.body.paymentType);
  assertDropPaymentType(project, type);
  const amount = paymentAmount(project, type);
  const order = await razorpayClient().orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: `htge_${project.id.slice(-10)}_${Date.now()}`,
    notes: { projectId: project.id, paymentType: type },
  });
  await Payment.create({ project: project._id, user: project.client, amount, type, status: 'PENDING', razorpayOrderId: order.id });
  res.json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency, paymentType: type } });
}

export async function verifyPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.body.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  assertClientProject(project, req);
  const type = validPaymentType(req.body.paymentType);
  assertDropPaymentType(project, type);
  const orderId = String(req.body.razorpay_order_id || '');
  const paymentId = String(req.body.razorpay_payment_id || '');
  const signature = String(req.body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) throw new HttpError(400, 'Missing Razorpay payment verification fields.');

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new HttpError(503, 'Razorpay test credentials are not configured on the server.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const signaturesMatch = signature.length === expectedSignature.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!signaturesMatch) throw new HttpError(400, 'Razorpay payment signature is invalid.');

  const payment = await Payment.findOne({ razorpayOrderId: orderId, project: project._id, type, status: 'PENDING' });
  if (!payment) throw new HttpError(404, 'No pending payment was found for this order.');
  payment.status = 'COMPLETED';
  payment.razorpayPaymentId = paymentId;
  await payment.save();

  if (type === 'ESCROW') {
    project.status = 'ONGOING';
    await User.findByIdAndUpdate(project.client, { $inc: { walletBalance: payment.amount } });
  } else {
    project.status = 'DROP_REQUESTED';
  }
  await project.save();

  const freelancerId = req.body.freelancerId ? String(req.body.freelancerId) : undefined;
  await Message.create({
    project: project._id,
    sender: project.client,
    ...(freelancerId ? { freelancer: freelancerId } : {}),
    content: type === 'ESCROW'
      ? 'Client has funded the full project escrow. Work is now in progress.'
      : `Client paid the ${type === 'PENALTY_25' ? '25%' : '10%'} project drop fee. Awaiting admin approval.`,
  });
  res.json({ success: true, message: 'Payment verified successfully.', project: formatProject(project, [payment]) });
}

export async function rejectPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const project = await Project.findById(req.body.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  assertClientProject(project, req);
  const type = validPaymentType(req.body.paymentType);
  const payment = await Payment.findOne({ project: project._id, type, status: 'PENDING' }).sort({ createdAt: -1 });
  if (payment) {
    payment.status = 'FAILED';
    await payment.save();
  }
  await Message.create({
    project: project._id,
    sender: project.client,
    ...(req.body.freelancerId ? { freelancer: req.body.freelancerId } : {}),
    content: `PAYMENT_REJECTED_PAYLOAD|${project.title}`,
  });
  res.json({ success: true });
}
