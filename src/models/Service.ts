
import mongoose, { Schema, Model } from "mongoose";

export interface IService {
  name: string;
  slug: string;
  category: "grooming" | "boarding" | "vet";
  description?: string;
  price: number;
  duration: number;
  forPetType: ("dog" | "cat")[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IService>(
  {
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: [true, "Service slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ["grooming", "boarding", "vet"],
      required: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    forPetType: {
      type: [
        {
          type: String,
          enum: ["dog", "cat"],
        },
      ],
      required: true,
      validate: {
        validator: (types: string[]) => types.length > 0,
        message: "At least one supported pet type is required.",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Service: Model<IService> =
  mongoose.models.Service ||
  mongoose.model<IService>("Service", ServiceSchema);

export default Service;
