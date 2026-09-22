import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export const PAYMENT_TYPES = ['ESCROW', 'PENALTY_10', 'PENALTY_25', 'REFUND'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentShape {
  project: Types.ObjectId;
  user: Types.ObjectId;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentDocument = HydratedDocument<PaymentShape>;
export type PaymentModel = Model<PaymentShape>;

const paymentSchema = new Schema<PaymentShape, PaymentModel>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: PAYMENT_TYPES, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING', index: true },
    razorpayOrderId: { type: String, sparse: true, index: true },
    razorpayPaymentId: { type: String, sparse: true, index: true },
    razorpayRefundId: { type: String, sparse: true },
  },
  { timestamps: true, versionKey: false },
);

export const Payment = model<PaymentShape, PaymentModel>('Payment', paymentSchema);
