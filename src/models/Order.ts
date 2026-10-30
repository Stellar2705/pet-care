
import mongoose, { Schema, Model, Types } from "mongoose";

export interface IOrderItem {
  productId: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IOrder {
  customerId: Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  shippingAddress: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  orderStatus: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
  stockDeducted: boolean;
  stockRestored: boolean;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  refundStatus?: "pending" | "processed" | "failed";
  razorpayRefundIdempotencyKey?: string;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: "An order must contain at least one item",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingAddress: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    stockDeducted: {
      type: Boolean,
      default: false,
    },
    stockRestored: {
      type: Boolean,
      default: false,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    razorpayOrderId: {
    type: String,
    default: undefined,
    index: true,
    },
    razorpayPaymentId: {
    type: String,
    default: undefined,
    index: true,
    },
    razorpayRefundId: {
    type: String,
    default: undefined,
    index: true,
    },
    refundStatus: {
    type: String,
    enum: ["pending", "processed", "failed"],
    default: undefined,
    },
    razorpayRefundIdempotencyKey: {
    type: String,
    default: undefined,
    },
  },
  { timestamps: true }
);

OrderSchema.index({ createdAt: -1 });

const Order: Model<IOrder> =
  mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);

export default Order;
