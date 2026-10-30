import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { getAuthenticatedUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    // Admin-only access
    if (user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Access denied. Admin only." },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid notification ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true, runValidators: true }
    );

    if (!notification) {
      return NextResponse.json(
        { success: false, message: "Notification not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update notification.",
      },
      { status: 500 }
    );
  }
}