
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Inquiry from "@/models/Inquiry";

// GET: Fetch all inquiries (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    await connectDB();

    const inquiries = await Inquiry.find({})
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    console.error("Failed to fetch inquiries:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch inquiries." },
      { status: 500 }
    );
  }
}
