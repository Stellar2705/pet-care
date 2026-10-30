import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";
import Razorpay from "razorpay";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await request.json();

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        { success: false, message: "Payment details are required" },
        { status: 400 }
      );
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
      return NextResponse.json(
        { success: false, message: "Payment gateway is not configured" },
        { status: 500 }
      );
    }

    await connectDB();

    const order = await Order.findOne({
      customerId: user.id,
      razorpayOrderId: razorpay_order_id,
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Matching order not found" },
        { status: 404 }
      );
    }

    if (order.paymentStatus === "paid") {
  if (order.razorpayPaymentId !== razorpay_payment_id) {
    return NextResponse.json(
      {
        success: false,
        message: "This order was already paid using a different payment",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Payment has already been verified",
    orderId: order._id.toString(),
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
  });
}

    if (
      order.paymentStatus !== "pending" ||
      order.orderStatus === "cancelled" ||
      order.stockRestored
    ) {
      return NextResponse.json(
        { success: false, message: "Order cannot be paid" },
        { status: 409 }
      );
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(razorpay_signature, "hex");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const payment = await razorpay.payments.fetch(razorpay_payment_id);

if (
  payment.order_id !== razorpay_order_id ||
  payment.amount !== Math.round(order.totalAmount * 100) ||
  payment.currency !== "INR"
) {
  return NextResponse.json(
    { success: false, message: "Payment details do not match the order" },
    { status: 400 }
  );
}

if (payment.status !== "captured") {
  return NextResponse.json(
    {
      success: false,
      message: "Payment has not been captured yet",
      paymentStatus: payment.status,
    },
    { status: 409 }
  );
}

order.paymentStatus = "paid";
order.orderStatus = "confirmed";
order.razorpayPaymentId = razorpay_payment_id;

await order.save();

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully",
      orderId: order._id.toString(),
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to verify payment" },
      { status: 500 }
    );
  }
}
