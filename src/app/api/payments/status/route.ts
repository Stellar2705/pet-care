
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "Order ID is required" },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, message: "Payment gateway is not configured" },
        { status: 500 }
      );
    }

    await connectDB();

    const order = await Order.findOne({
      _id: orderId,
      customerId: user.id,
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    if (!order.razorpayOrderId) {
      return NextResponse.json(
        { success: false, message: "No Razorpay payment order is linked" },
        { status: 409 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const payments = await razorpay.orders.fetchPayments(
      order.razorpayOrderId
    );

    const expectedAmount = Math.round(order.totalAmount * 100);

    const matchingPayment = payments.items.find(
      (payment) =>
        payment.amount === expectedAmount &&
        payment.currency === "INR"
    );

    const capturedPayment = payments.items.find(
      (payment) =>
        payment.status === "captured" &&
        payment.amount === expectedAmount &&
        payment.currency === "INR"
    );

    if (capturedPayment) {
      if (
        order.orderStatus === "cancelled" ||
        order.stockRestored
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Payment captured, but the order was cancelled. Manual review is required.",
            paymentStatus: "review_required",
          },
          { status: 409 }
        );
      }

      if (
        order.paymentStatus !== "paid" ||
        order.razorpayPaymentId !== capturedPayment.id
      ) {
        order.paymentStatus = "paid";
        order.orderStatus = "confirmed";
        order.razorpayPaymentId = capturedPayment.id;
        await order.save();
      }
    } else if (
      matchingPayment?.status === "failed" &&
      order.paymentStatus === "pending"
    ) {
      // Keep the order pending so the customer can retry payment.
      // Do not release stock for a failed payment attempt.
    }

    return NextResponse.json({
      success: true,
      orderId: order._id.toString(),
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      razorpayPaymentStatus: capturedPayment
        ? "captured"
        : matchingPayment?.status || "not_attempted",
      razorpayPaymentId: capturedPayment?.id || null,
    });
  } catch (error) {
    console.error("Payment status check error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to check payment status" },
      { status: 500 }
    );
  }
}
