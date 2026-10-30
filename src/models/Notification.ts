
import mongoose, { Schema, Model, Types } from "mongoose";

export interface INotification {
  title: string;
  message: string;
  type: "order" | "booking" | "inquiry";
  referenceId: Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    type: {
      type: String,
      enum: ["order", "booking", "inquiry"],
      required: true,
      index: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ createdAt: -1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>(
    "Notification",
    NotificationSchema
  );

export default Notification;
