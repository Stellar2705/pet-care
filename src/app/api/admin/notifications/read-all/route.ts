import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    if (user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Access denied. Admin only." },
        { status: 403 }
      );
    }

    await connectDB();

    const result = await Notification.updateMany(
      { isRead: false },
      { $set: { isRead: true } }
    );

    return NextResponse.json({
      success: true,
      message: "All notifications marked as read.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to mark all notifications as read.",
      },
      { status: 500 }
    );
  }
}