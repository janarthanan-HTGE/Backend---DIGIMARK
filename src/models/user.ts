import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export const USER_ROLES = ['ADMIN', 'CLIENT', 'FREELANCER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  companyName?: string;
  industry?: string;
  website?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  skills?: string[];
  experienceYears?: number;
  portfolioUrl?: string;
  rating?: number;
}

export interface UserShape {
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  profile: UserProfile;
  walletBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserShape>;
export type UserModel = Model<UserShape>;

const profileSchema = new Schema<UserProfile>(
  {
    companyName: { type: String, trim: true },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true, uppercase: true },
    branchName: { type: String, trim: true },
    skills: { type: [String], default: [] },
    experienceYears: { type: Number, min: 0 },
    portfolioUrl: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5 },
  },
  { _id: false },
);

const userSchema = new Schema<UserShape, UserModel>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'CLIENT', index: true },
    phone: { type: String, trim: true, maxlength: 30 },
    profile: { type: profileSchema, default: () => ({}) },
    walletBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const User = model<UserShape, UserModel>('User', userSchema);
export type UserId = Types.ObjectId;
