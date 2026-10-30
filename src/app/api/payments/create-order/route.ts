
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
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

    const { orderId } = await request.json();

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { success: false, message: "Valid order ID is required" },
        { status: 400 }
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

    if (order.paymentStatus !== "pending") {
      return NextResponse.json(
        { success: false, message: "Order is not awaiting payment" },
        { status: 409 }
      );
    }

    if (order.orderStatus === "cancelled" || order.stockRestored) {
      return NextResponse.json(
        { success: false, message: "This order cannot be paid for" },
        { status: 409 }
      );
    }

    if (!order.stockDeducted) {
      return NextResponse.json(
        { success: false, message: "Order stock has not been reserved" },
        { status: 409 }
      );
    }

    const amount = Math.round(order.totalAmount * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid order amount" },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    let paymentOrder;

    if (order.razorpayOrderId) {
      try {
        const existingPaymentOrder = await razorpay.orders.fetch(
          order.razorpayOrderId
        );

        if (
          existingPaymentOrder.amount === amount &&
          existingPaymentOrder.currency === "INR" &&
          existingPaymentOrder.status === "created"
        ) {
          paymentOrder = existingPaymentOrder;
        }
      } catch (error) {
        console.error("Existing Razorpay order fetch failed:", error);
      }
    }

    if (!paymentOrder) {
      paymentOrder = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: order._id.toString(),
        notes: {
          petCareOrderId: order._id.toString(),
          customerId: user.id,
        },
      });

      order.razorpayOrderId = paymentOrder.id;
      await order.save();
    }

    return NextResponse.json({
      success: true,
      paymentOrderId: paymentOrder.id,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      keyId,
    });
  } catch (error) {
    console.error("Create payment order error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to create payment order" },
      { status: 500 }
    );
  }
}
