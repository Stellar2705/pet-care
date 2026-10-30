
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Product from "@/models/Product";

// PATCH: Update an existing product (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const allowedFields = [
      "name",
      "slug",
      "description",
      "price",
      "category",
      "images",
      "stock",
      "isActive",
    ];

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "Provide at least one field to update." },
        { status: 400 }
      );
    }

    if (
      "name" in updates &&
      (typeof updates.name !== "string" ||
        !updates.name.trim() ||
        updates.name.trim().length > 150)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product name." },
        { status: 400 }
      );
    }

    if (
      "slug" in updates &&
      (typeof updates.slug !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(updates.slug.trim()))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product slug." },
        { status: 400 }
      );
    }

    if (
      "description" in updates &&
      (typeof updates.description !== "string" ||
        !updates.description.trim() ||
        updates.description.length > 3000)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product description." },
        { status: 400 }
      );
    }

    if (
      "price" in updates &&
      (typeof updates.price !== "number" ||
        !Number.isFinite(updates.price) ||
        updates.price < 0)
    ) {
      return NextResponse.json(
        { success: false, message: "Price must be a non-negative number." },
        { status: 400 }
      );
    }

    if (
      "category" in updates &&
      (typeof updates.category !== "string" ||
        !updates.category.trim() ||
        updates.category.trim().length > 100)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product category." },
        { status: 400 }
      );
    }

    if (
      "images" in updates &&
      (!Array.isArray(updates.images) ||
        !updates.images.every(
          (image: unknown) =>
            typeof image === "string" && image.length <= 2048
        ))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product images." },
        { status: 400 }
      );
    }

    if (
      "stock" in updates &&
      (typeof updates.stock !== "number" ||
        !Number.isInteger(updates.stock) ||
        updates.stock < 0)
    ) {
      return NextResponse.json(
        { success: false, message: "Stock must be a non-negative whole number." },
        { status: 400 }
      );
    }

    if (
      "isActive" in updates &&
      typeof updates.isActive !== "boolean"
    ) {
      return NextResponse.json(
        { success: false, message: "isActive must be true or false." },
        { status: 400 }
      );
    }

    if (typeof updates.name === "string") {
      updates.name = updates.name.trim();
    }

    if (typeof updates.slug === "string") {
      updates.slug = updates.slug.trim().toLowerCase();
    }

    if (typeof updates.description === "string") {
      updates.description = updates.description.trim();
    }

    if (typeof updates.category === "string") {
      updates.category = updates.category.trim();
    }

    await connectDB();

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select("-__v")
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product updated successfully.",
      product,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { success: false, message: "A product with this slug already exists." },
        { status: 409 }
      );
    }

    console.error("Product update failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update product." },
      { status: 500 }
    );
  }
}


export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true, runValidators: true }
    )
      .select("-__v")
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product deactivated successfully.",
      product,
    });
  } catch (error) {
    console.error("Product deactivation failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to deactivate product." },
      { status: 500 }
    );
  }
}
