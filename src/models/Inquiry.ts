
import mongoose, { Schema, Model, Types } from "mongoose";

export interface IInquiry {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  userId?: Types.ObjectId;
  status: "new" | "in_progress" | "resolved";
  createdAt: Date;
  updatedAt: Date;
}

const InquirySchema = new Schema<IInquiry>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 25,
    },

    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      maxlength: 150,
    },

    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: 5000,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    status: {
      type: String,
      enum: ["new", "in_progress", "resolved"],
      default: "new",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Inquiry: Model<IInquiry> =
  mongoose.models.Inquiry ||
  mongoose.model<IInquiry>("Inquiry", InquirySchema);

export default Inquiry;
