import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export const PROJECT_STATUSES = ['PUBLISHED', 'ONGOING', 'COMPLETED', 'DROPPED', 'DROP_REQUESTED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectAsset {
  _id: Types.ObjectId;
  fileName: string;
  fileUrl: string;
  createdAt: Date;
}

export interface ProjectShape {
  title: string;
  description: string;
  budget: number;
  timeline?: string;
  status: ProjectStatus;
  completionPercentage: number;
  googleDriveLink?: string;
  rating?: number;
  review?: string;
  client: Types.ObjectId;
  freelancers: Types.ObjectId[];
  assets: ProjectAsset[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<ProjectShape>;
export type ProjectModel = Model<ProjectShape>;

const assetSchema = new Schema<ProjectAsset>(
  {
    fileName: { type: String, required: true, trim: true, maxlength: 240 },
    fileUrl: { type: String, required: true, trim: true, maxlength: 2_000 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

const projectSchema = new Schema<ProjectShape, ProjectModel>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 10_000 },
    budget: { type: Number, required: true, min: 1 },
    timeline: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: PROJECT_STATUSES, default: 'PUBLISHED', index: true },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    googleDriveLink: { type: String, trim: true, maxlength: 2_000 },
    rating: { type: Number, min: 1, max: 5 },
    review: { type: String, trim: true, maxlength: 2_000 },
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    freelancers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    assets: { type: [assetSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

projectSchema.index({ client: 1, status: 1, createdAt: -1 });

export const Project = model<ProjectShape, ProjectModel>('Project', projectSchema);
