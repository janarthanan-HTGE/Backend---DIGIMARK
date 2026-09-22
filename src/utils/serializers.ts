import { Types } from 'mongoose';
import { MessageShape } from '../models/message';
import { PaymentShape } from '../models/payment';
import { ProjectShape } from '../models/project';
import { UserShape } from '../models/user';

type MongoValue<T> = T & { _id?: Types.ObjectId; id?: string; toObject?: () => T };

function plain<T>(value: MongoValue<T>): T & { _id?: Types.ObjectId; id?: string } {
  return typeof value.toObject === 'function' ? (value.toObject() as T & { _id?: Types.ObjectId; id?: string }) : value;
}

export function entityId(value: unknown): string {
  if (value && typeof value === 'object') {
    const candidate = value as { _id?: unknown; id?: unknown };
    if (candidate._id) return String(candidate._id);
    if (candidate.id) return String(candidate.id);
  }
  return String(value);
}

export function formatUser(user: MongoValue<UserShape>, includeProfile = true): Record<string, unknown> {
  const item = plain(user);
  return {
    id: entityId(item),
    email: item.email,
    fullName: item.fullName,
    name: item.fullName,
    role: item.role,
    phone: item.phone || '',
    ...(includeProfile ? { profile: item.profile || {} } : {}),
    walletBalance: item.walletBalance || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function formatProject(project: MongoValue<ProjectShape>, payments: MongoValue<PaymentShape>[] = []): Record<string, unknown> {
  const item = plain(project) as ProjectShape & {
    _id?: Types.ObjectId;
    client: MongoValue<UserShape> | Types.ObjectId;
    freelancers: Array<MongoValue<UserShape> | Types.ObjectId>;
  };
  const clientIsPopulated = item.client && typeof item.client === 'object' && 'fullName' in item.client;
  const clientId = entityId(item.client);
  const freelancerEntries = (item.freelancers || []).map((freelancer) => {
    const freelancerId = entityId(freelancer);
    const isPopulated = freelancer && typeof freelancer === 'object' && 'fullName' in freelancer;
    return {
      id: `${entityId(item)}_${freelancerId}`,
      projectId: entityId(item),
      freelancerId,
      freelancer: isPopulated ? formatUser(freelancer as unknown as MongoValue<UserShape>) : { id: freelancerId },
      assignedAt: item.createdAt,
    };
  });

  return {
    id: entityId(item),
    title: item.title,
    description: item.description,
    budget: item.budget,
    timeline: item.timeline || '',
    status: item.status,
    completionPercentage: item.completionPercentage || 0,
    googleDriveLink: item.googleDriveLink || '',
    rating: item.rating,
    review: item.review,
    clientId,
    client: clientIsPopulated ? formatUser(item.client as MongoValue<UserShape>) : { id: clientId },
    freelancers: freelancerEntries,
    assets: (item.assets || []).map((asset) => ({
      id: entityId(asset),
      fileName: asset.fileName,
      fileUrl: asset.fileUrl,
      projectId: entityId(item),
      createdAt: asset.createdAt,
    })),
    payments: payments.map(formatPayment),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function formatPayment(payment: MongoValue<PaymentShape>): Record<string, unknown> {
  const item = plain(payment);
  return {
    id: entityId(item),
    projectId: entityId(item.project),
    userId: entityId(item.user),
    amount: item.amount,
    type: item.type,
    status: item.status,
    razorpayOrderId: item.razorpayOrderId,
    razorpayPaymentId: item.razorpayPaymentId,
    razorpayRefundId: item.razorpayRefundId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function formatMessage(message: MongoValue<MessageShape>): Record<string, unknown> {
  const item = plain(message) as MessageShape & { _id?: Types.ObjectId; sender: MongoValue<UserShape> | Types.ObjectId };
  const senderIsPopulated = item.sender && typeof item.sender === 'object' && 'fullName' in item.sender;
  const sender = senderIsPopulated ? (item.sender as MongoValue<UserShape>) : undefined;
  return {
    id: entityId(item),
    text: item.content,
    content: item.content,
    sender: sender ? sender.fullName : 'Unknown user',
    senderId: entityId(item.sender),
    freelancerId: item.freelancer ? entityId(item.freelancer) : null,
    time: new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    createdAt: item.createdAt,
  };
}
