import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface MessageShape {
  project: Types.ObjectId;
  sender: Types.ObjectId;
  freelancer?: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<MessageShape>;
export type MessageModel = Model<MessageShape>;

const messageSchema = new Schema<MessageShape, MessageModel>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    freelancer: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    content: { type: String, required: true, trim: true, maxlength: 10_000 },
  },
  { timestamps: true, versionKey: false },
);

messageSchema.index({ project: 1, freelancer: 1, createdAt: 1 });

export const Message = model<MessageShape, MessageModel>('Message', messageSchema);
