
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Inquiry from "@/models/Inquiry";

// PATCH: Update inquiry status (admin only)
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
        { success: false, message: "Invalid inquiry ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const allowedStatuses = ["new", "in_progress", "resolved"];

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid inquiry status." },
        { status: 400 }
      );
    }

    await connectDB();

    const inquiry = await Inquiry.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true }
    )
      .select("-__v")
      .lean();

    if (!inquiry) {
      return NextResponse.json(
        { success: false, message: "Inquiry not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Inquiry status updated successfully.",
      inquiry,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    console.error("Failed to update inquiry:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update inquiry." },
      { status: 500 }
    );
  }
}
