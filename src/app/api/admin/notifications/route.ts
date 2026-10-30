import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";

export async function GET(request: NextRequest) {
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

    await connectDB();

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page")) || 1);

    const requestedLimit = Number(searchParams.get("limit")) || 20;
    const limit = Math.min(50, Math.max(1, requestedLimit));

    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const filter = unreadOnly ? { isRead: false } : {};

    const skip = (page - 1) * limit;

    // Fetch notifications and counts
    const [notifications, totalCount, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments(filter),

      Notification.countDocuments({ isRead: false }),
    ]);

    return NextResponse.json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error("Fetch notifications error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch notifications.",
      },
      { status: 500 }
    );
  }
}