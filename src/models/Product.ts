
import mongoose, { Schema, Model } from "mongoose";

export interface IProduct {
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: 150,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
      maxlength: 3000,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    images: {
      type: [String],
      default: [],
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Stock must be a whole number",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

const Product: Model<IProduct> =
  mongoose.models.Product ||
  mongoose.model<IProduct>("Product", ProductSchema);

export default Product;
