
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Admin authentication
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    // 2. Validate order ID
    const { id } = params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID." },
        { status: 400 }
      );
    }

    // 3. Check Razorpay credentials
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, message: "Payment gateway is not configured." },
        { status: 500 }
      );
    }

    await connectDB();

    // 4. Find order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    // 5. Check payment ID
    if (!order.razorpayPaymentId) {
      return NextResponse.json(
        {
          success: false,
          message: "No Razorpay payment is linked to this order.",
        },
        { status: 404 }
      );
    }

    // 6. Handle refund requests without a refund ID
    if (!order.razorpayRefundId) {
      return NextResponse.json(
        {
          success: false,
          message:
            order.refundStatus === "pending"
              ? "Refund request is pending reconciliation, but Razorpay has not returned a refund ID yet."
              : "No refund ID is linked to this order.",
          refundStatus: order.refundStatus ?? null,
          paymentStatus: order.paymentStatus,
        },
        { status: 409 }
      );
    }

    // 7. Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // 8. Fetch refund details
    const refund = await razorpay.payments.fetchRefund(
      order.razorpayPaymentId,
      order.razorpayRefundId
    );

    // 9. Verify refund details
    const expectedAmount = Math.round(order.totalAmount * 100);

    if (
      refund.payment_id !== order.razorpayPaymentId ||
      refund.id !== order.razorpayRefundId ||
      refund.amount !== expectedAmount
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Refund details do not match the order.",
        },
        { status: 409 }
      );
    }

    // 10. Update local refund status
    // Never downgrade a completed refund.
    if (order.refundStatus !== "processed") {
      if (refund.status === "processed") {
        order.refundStatus = "processed";
        order.paymentStatus = "refunded";
        await order.save();
      } else if (refund.status === "failed") {
        order.refundStatus = "failed";
        await order.save();
      } else {
        order.refundStatus = "pending";
        await order.save();
      }
    }

    // 11. Return latest status
    return NextResponse.json({
      success: true,
      orderId: order._id.toString(),
      refundId: refund.id,
      razorpayRefundStatus: refund.status,
      refundStatus: order.refundStatus,
      paymentStatus: order.paymentStatus,
    });
  } catch (error) {
    console.error("Refund status check error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to check refund status.",
      },
      { status: 500 }
    );
  }
}
