
import mongoose, { Schema, Model, Types } from "mongoose";

export interface IBooking {
  customerId: Types.ObjectId;
  petId: Types.ObjectId;
  serviceId: Types.ObjectId;
  date: Date;
  slot: string;
  atHomeOrCenter: "home" | "center";
  address?: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    petId: {
      type: Schema.Types.ObjectId,
      ref: "Pet",
      required: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    date: {
      type: Date,
      required: [true, "Booking date is required"],
    },
    slot: {
      type: String,
      required: [true, "Time slot is required"],
      trim: true,
    },
    atHomeOrCenter: {
      type: String,
      enum: ["home", "center"],
      required: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

BookingSchema.index({ date: 1, slot: 1, status: 1 });

const Booking: Model<IBooking> =
  mongoose.models.Booking ||
  mongoose.model<IBooking>("Booking", BookingSchema);

export default Booking;
