import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Message } from '../models/message';
import { Payment } from '../models/payment';
import { Project } from '../models/project';
import { User, UserShape } from '../models/user';
import { HttpError } from '../utils/errors';
import { entityId, formatProject } from '../utils/serializers';
import { ensureEmail, ensureObjectId, ensureString } from '../utils/validation';

type CompanyMetrics = { total: number; ongoing: number; completed: number };
type FreelancerMetrics = { total: number; active: number };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '??';
}

function formatCompany(user: UserShape & { _id?: unknown }, metrics: CompanyMetrics = { total: 0, ongoing: 0, completed: 0 }): Record<string, unknown> {
  const companyName = user.profile?.companyName || user.fullName;
  return {
    id: entityId(user),
    name: companyName,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    initials: initials(companyName),
    industry: user.profile?.industry || 'Tech / Services',
    website: user.profile?.website || '',
    projects: metrics,
    dateJoined: user.createdAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function formatFreelancer(user: UserShape & { _id?: unknown }, metrics: FreelancerMetrics = { total: 0, active: 0 }): Record<string, unknown> {
  return {
    id: entityId(user),
    name: user.fullName,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    initials: initials(user.fullName),
    title: 'Freelance Professional',
    location: 'Remote',
    skills: user.profile?.skills || [],
    rating: user.profile?.rating || 5,
    experienceYears: user.profile?.experienceYears || 0,
    portfolioUrl: user.profile?.portfolioUrl || '',
    projectsCount: metrics.total,
    status: metrics.active > 0 ? 'BUSY' : 'AVAILABLE',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function companyMetrics(clientId: string): Promise<CompanyMetrics> {
  const rows = await Project.aggregate<{ _id: string; count: number }>([
    { $match: { client: ensureObjectId(clientId, 'Client ID') } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { total, ongoing: rows.find((row) => row._id === 'ONGOING')?.count || 0, completed: rows.find((row) => row._id === 'COMPLETED')?.count || 0 };
}

async function freelancerMetrics(freelancerId: string): Promise<FreelancerMetrics> {
  const projects = await Project.find({ freelancers: ensureObjectId(freelancerId, 'Freelancer ID') }).select('status');
  return { total: projects.length, active: projects.filter((project) => project.status === 'ONGOING').length };
}

export async function dashboardStats(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const [published, ongoing, completed, dropped, dropRequested, clients, freelancers, completedPayments, escrowPayments] = await Promise.all([
    Project.countDocuments({ status: 'PUBLISHED' }),
    Project.countDocuments({ status: 'ONGOING' }),
    Project.countDocuments({ status: 'COMPLETED' }),
    Project.countDocuments({ status: 'DROPPED' }),
    Project.countDocuments({ status: 'DROP_REQUESTED' }),
    User.countDocuments({ role: 'CLIENT' }),
    User.countDocuments({ role: 'FREELANCER' }),
    Payment.aggregate<{ _id: null; total: number }>([{ $match: { type: 'ESCROW', status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate<{ _id: null; total: number }>([{ $match: { type: 'ESCROW', status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const totalRevenue = completedPayments[0]?.total || 0;
  const escrowTotal = escrowPayments[0]?.total || 0;
  res.json({
    success: true,
    data: {
      totalRevenue,
      pendingPayouts: escrowTotal,
      awaitingReview: published,
      activeDisputes: dropRequested,
      totalCompanies: clients,
      totalFreelancers: freelancers,
      totalPayments: completedPayments.length,
      pipelineCounts: { pendingReview: published, assigned: 0, ongoing, completed, dropped, total: published + ongoing + completed + dropped + dropRequested },
    },
  });
}

export async function listCompanies(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const companies = await User.find({ role: 'CLIENT' }).sort({ createdAt: -1 });
  const formatted = await Promise.all(companies.map(async (company) => formatCompany(company.toObject(), await companyMetrics(company.id))));
  res.json({ success: true, data: formatted });
}

export async function getCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const company = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'CLIENT' });
  if (!company) throw new HttpError(404, 'Company not found.');
  res.json({ success: true, data: formatCompany(company.toObject(), await companyMetrics(company.id)) });
}

export async function createCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const password = typeof req.body.password === 'string' && req.body.password.trim() ? req.body.password.trim() : crypto.randomBytes(6).toString('base64url');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  const name = ensureString(req.body.name, 'Company name', 2);
  const company = await User.create({
    email: ensureEmail(req.body.email),
    fullName: name,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'CLIENT',
    profile: {
      companyName: name,
      industry: typeof req.body.industry === 'string' ? req.body.industry.trim() : 'Tech / Services',
      website: typeof req.body.website === 'string' ? req.body.website.trim() : '',
    },
  });
  res.status(201).json({ success: true, data: { ...formatCompany(company.toObject()), generatedPassword: password } });
}

export async function updateCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const company = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'CLIENT' }).select('+passwordHash');
  if (!company) throw new HttpError(404, 'Company not found.');
  if (req.body.name !== undefined) {
    const name = ensureString(req.body.name, 'Company name', 2);
    company.fullName = name;
    company.profile.companyName = name;
  }
  if (req.body.email !== undefined) company.email = ensureEmail(req.body.email);
  if (req.body.industry !== undefined) company.profile.industry = String(req.body.industry).trim();
  if (req.body.website !== undefined) company.profile.website = String(req.body.website).trim();
  if (typeof req.body.password === 'string' && req.body.password.trim()) {
    if (req.body.password.trim().length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
    company.passwordHash = await bcrypt.hash(req.body.password.trim(), 12);
  }
  await company.save();
  res.json({ success: true, data: formatCompany(company.toObject(), await companyMetrics(company.id)) });
}

export async function deleteCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const company = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'CLIENT' });
  if (!company) throw new HttpError(404, 'Company not found.');
  const projects = await Project.find({ client: company._id }).select('_id');
  const projectIds = projects.map((project) => project._id);
  await Promise.all([
    Message.deleteMany({ $or: [{ project: { $in: projectIds } }, { sender: company._id }] }),
    Payment.deleteMany({ $or: [{ project: { $in: projectIds } }, { user: company._id }] }),
    Project.deleteMany({ client: company._id }),
    User.deleteOne({ _id: company._id }),
  ]);
  res.json({ success: true });
}

export async function listFreelancers(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const freelancers = await User.find({ role: 'FREELANCER' }).sort({ createdAt: -1 });
  const formatted = await Promise.all(freelancers.map(async (freelancer) => formatFreelancer(freelancer.toObject(), await freelancerMetrics(freelancer.id))));
  res.json({ success: true, data: formatted });
}

export async function getFreelancer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const freelancer = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'FREELANCER' });
  if (!freelancer) throw new HttpError(404, 'Freelancer not found.');
  const projects = await Project.find({ freelancers: freelancer._id }).sort({ createdAt: -1 }).populate('client', 'fullName email phone profile role').populate('freelancers', 'fullName email phone profile role');
  res.json({ success: true, data: { ...formatFreelancer(freelancer.toObject(), await freelancerMetrics(freelancer.id)), projects: projects.map((project) => formatProject(project)) } });
}

function readSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((skill): skill is string => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((skill) => skill.trim()).filter(Boolean);
  return [];
}

export async function createFreelancer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const password = typeof req.body.password === 'string' && req.body.password.trim() ? req.body.password.trim() : crypto.randomBytes(6).toString('base64url');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  const freelancer = await User.create({
    email: ensureEmail(req.body.email),
    fullName: ensureString(req.body.name, 'Freelancer name', 2),
    phone: typeof req.body.phone === 'string' ? req.body.phone.trim() : '',
    passwordHash: await bcrypt.hash(password, 12),
    role: 'FREELANCER',
    profile: {
      skills: readSkills(req.body.skills),
      experienceYears: Number(req.body.experienceYears) || 0,
      portfolioUrl: typeof req.body.portfolioUrl === 'string' ? req.body.portfolioUrl.trim() : '',
    },
  });
  res.status(201).json({ success: true, data: { ...formatFreelancer(freelancer.toObject()), tempPassword: password } });
}

export async function updateFreelancer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const freelancer = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'FREELANCER' }).select('+passwordHash');
  if (!freelancer) throw new HttpError(404, 'Freelancer not found.');
  if (req.body.name !== undefined) freelancer.fullName = ensureString(req.body.name, 'Freelancer name', 2);
  if (req.body.email !== undefined) freelancer.email = ensureEmail(req.body.email);
  if (req.body.phone !== undefined) freelancer.phone = String(req.body.phone).trim();
  if (req.body.skills !== undefined) freelancer.profile.skills = readSkills(req.body.skills);
  if (req.body.experienceYears !== undefined) freelancer.profile.experienceYears = Number(req.body.experienceYears) || 0;
  if (req.body.portfolioUrl !== undefined) freelancer.profile.portfolioUrl = String(req.body.portfolioUrl).trim();
  if (typeof req.body.password === 'string' && req.body.password.trim()) {
    if (req.body.password.trim().length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
    freelancer.passwordHash = await bcrypt.hash(req.body.password.trim(), 12);
  }
  await freelancer.save();
  res.json({ success: true, data: formatFreelancer(freelancer.toObject(), await freelancerMetrics(freelancer.id)) });
}

export async function deleteFreelancer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const freelancer = await User.findOne({ _id: ensureObjectId(req.params.id), role: 'FREELANCER' });
  if (!freelancer) throw new HttpError(404, 'Freelancer not found.');
  await Promise.all([
    Message.deleteMany({ $or: [{ sender: freelancer._id }, { freelancer: freelancer._id }] }),
    Project.updateMany({ freelancers: freelancer._id }, { $pull: { freelancers: freelancer._id } }),
    User.deleteOne({ _id: freelancer._id }),
  ]);
  res.json({ success: true });
}

export async function listAdminProjects(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const projects = await Project.find().sort({ createdAt: -1 }).populate('client', 'fullName email phone profile role').populate('freelancers', 'fullName email phone profile role');
  const payments = await Payment.find({}).sort({ createdAt: -1 });
  const byProject = new Map<string, typeof payments>();
  for (const payment of payments) {
    const key = entityId(payment.project);
    const current = byProject.get(key) || [];
    current.push(payment);
    byProject.set(key, current);
  }
  res.json({ success: true, data: projects.map((project) => formatProject(project, byProject.get(project.id) || [])) });
}

export async function paymentSummary(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const projects = await Project.find().sort({ createdAt: -1 }).populate('client', 'fullName profile');
  const payments = await Payment.find().sort({ createdAt: -1 });
  const paymentsByProject = new Map<string, typeof payments>();
  for (const payment of payments) {
    const key = entityId(payment.project);
    const current = paymentsByProject.get(key) || [];
    current.push(payment);
    paymentsByProject.set(key, current);
  }

  const totals = { published: 0, ongoing: 0, completed: 0, refunded: 0 };
  const transactions = projects.map((project) => {
    const projectPayments = paymentsByProject.get(project.id) || [];
    const escrow = projectPayments.find((payment) => payment.type === 'ESCROW');
    const refund = projectPayments.find((payment) => payment.type === 'REFUND');
    let amount = escrow?.amount || project.budget;
    let status: 'In Escrow' | 'Released' | 'Refunded' | 'Pending' = 'Pending';
    if (project.status === 'ONGOING') { status = 'In Escrow'; totals.ongoing += amount; }
    if (project.status === 'COMPLETED') { status = 'Released'; totals.completed += amount; }
    if (project.status === 'PUBLISHED') { status = 'Pending'; totals.published += amount; }
    if (project.status === 'DROPPED') { status = 'Refunded'; amount = refund?.amount || amount; totals.refunded += amount; }
    const client = project.client as unknown as UserShape;
    return {
      id: `txn_${project.id}`,
      paymentId: escrow?.razorpayPaymentId || escrow?.razorpayOrderId || `txn_${project.id.slice(-8)}`,
      projectId: project.id,
      projectTitle: project.title,
      companyName: client?.profile?.companyName || client?.fullName || 'Unknown company',
      clientName: client?.fullName || 'Unknown client',
      amount: `₹${amount.toLocaleString('en-IN')}`,
      rawAmount: amount,
      gateway: 'Razorpay',
      status,
      projectStatus: project.status,
      date: project.updatedAt,
    };
  });
  const formatMoney = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;
  res.json({ success: true, data: { totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, formatMoney(value)])), transactions } });
}

export async function adminNotifications(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const projects = await Project.find({ $or: [{ status: 'DROP_REQUESTED' }, { status: 'PUBLISHED' }] }).sort({ updatedAt: -1 }).limit(20);
  const notifications = projects.map((project) => {
    if (project.status === 'DROP_REQUESTED') {
      return { id: `drop_${project.id}`, title: 'Project drop requested', description: `A client requested to drop "${project.title}".`, type: 'alert', timestamp: project.updatedAt, link: '/admin/refunds' };
    }
    if (!project.freelancers.length) {
      return { id: `assignment_${project.id}`, title: 'Project needs assignment', description: `"${project.title}" needs a freelancer assignment.`, type: 'info', timestamp: project.updatedAt, link: '/admin/projects' };
    }
    return { id: `payment_${project.id}`, title: 'Escrow pending', description: `"${project.title}" is waiting for escrow funding.`, type: 'warning', timestamp: project.updatedAt, link: '/admin/payments' };
  });
  res.json({ success: true, data: notifications });
}
