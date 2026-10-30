
import mongoose, { Schema, Model, Types } from "mongoose";

export interface IPet {
  ownerId: Types.ObjectId;
  name: string;
  type: "dog" | "cat";
  breed?: string;
  age?: number;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PetSchema = new Schema<IPet>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, "Pet name is required"],
      trim: true,
      maxlength: 100,
    },

    type: {
      type: String,
      enum: ["dog", "cat"],
      required: [true, "Pet type is required"],
    },

    breed: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    age: {
      type: Number,
      min: 0,
      max: 100,
    },

    image: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Pet: Model<IPet> =
  mongoose.models.Pet ||
  mongoose.model<IPet>("Pet", PetSchema);

export default Pet;
