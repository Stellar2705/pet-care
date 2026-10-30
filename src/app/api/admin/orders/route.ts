import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";
import Product from "@/models/Product";

// GET: Fetch all customer orders (admin only)
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
    void Product;

    const orders = await Order.find({})
      .populate("customerId", "name email")
      .populate("items.productId", "name category")
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Failed to fetch all orders:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch orders." },
      { status: 500 }
    );
  }
}
