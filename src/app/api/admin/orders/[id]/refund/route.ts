
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";

interface RazorpayRefundResponse {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: "pending" | "processed" | "failed";
  error?: {
    description?: string;
  };
}

export async function POST(
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

    // 3. Read admin confirmation
    const requestData = (await request.json().catch(() => ({}))) as {
      confirmNoRefund?: boolean;
    };

    const confirmNoRefund = requestData.confirmNoRefund === true;

    // 4. Check Razorpay credentials
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, message: "Payment gateway is not configured." },
        { status: 500 }
      );
    }

    await connectDB();

    // 5. Find order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    // 6. Validate payment
    if (order.paymentStatus !== "paid") {
      return NextResponse.json(
        { success: false, message: "Only paid orders can be refunded." },
        { status: 409 }
      );
    }

    if (!order.razorpayPaymentId) {
      return NextResponse.json(
        { success: false, message: "Razorpay payment ID not found." },
        { status: 409 }
      );
    }

    // 7. Prevent duplicate completed refunds
    if (order.refundStatus === "processed") {
  return NextResponse.json(
    {
      success: false,
      message: "This order has already been refunded.",
    },
    { status: 409 }
  );
}

    // 8. Validate refund amount
    const amount = Math.round(order.totalAmount * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid refund amount." },
        { status: 400 }
      );
    }

    let idempotencyKey: string;

    // 9. Handle an existing pending refund
    if (order.refundStatus === "pending") {
      if (order.razorpayRefundId) {
        return NextResponse.json(
          {
            success: false,
            message:
              "A refund already exists. Check its status before taking further action.",
          },
          { status: 409 }
        );
      }

      if (!confirmNoRefund) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This refund is pending reconciliation. Check the Razorpay Dashboard and confirm that no refund was issued before retrying.",
            requiresConfirmation: true,
          },
          { status: 409 }
        );
      }

      if (!order.razorpayRefundIdempotencyKey) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The original idempotency key is missing. Manual reconciliation is required.",
          },
          { status: 409 }
        );
      }

      // Generate a new key after explicit admin confirmation.
      const newIdempotencyKey = randomUUID();

      // Atomically replace the old key.
      const retryLock = await Order.findOneAndUpdate(
        {
          _id: id,
          paymentStatus: "paid",
          razorpayPaymentId: order.razorpayPaymentId,
          refundStatus: "pending",
          razorpayRefundId: { $in: [null] },
          razorpayRefundIdempotencyKey:
            order.razorpayRefundIdempotencyKey,
        },
        {
          $set: {
            razorpayRefundIdempotencyKey: newIdempotencyKey,
          },
        },
        { new: true }
      );

      if (!retryLock) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The refund state changed or another retry was initiated. Check the order before trying again.",
          },
          { status: 409 }
        );
      }

      idempotencyKey = newIdempotencyKey;
    } else {
      // 10. Start a new refund operation
      idempotencyKey = randomUUID();

      const refundLock = await Order.findOneAndUpdate(
        {
          _id: id,
          paymentStatus: "paid",
          razorpayPaymentId: order.razorpayPaymentId,
          $or: [
            { refundStatus: { $exists: false } },
            { refundStatus: null },
            { refundStatus: "failed" },
          ],
        },
        {
          $set: {
            refundStatus: "pending",
            razorpayRefundIdempotencyKey: idempotencyKey,
          },
          $unset: {
            razorpayRefundId: 1,
          },
        },
        { new: true }
      );

      if (!refundLock) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Another refund request is already being processed or the order is no longer eligible.",
          },
          { status: 409 }
        );
      }
    }

    // 11. Prepare Razorpay request
    const requestBody = { amount };

    const authorization = Buffer.from(
      `${keyId}:${keySecret}`
    ).toString("base64");

    const razorpayResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${order.razorpayPaymentId}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/json",
          "X-Refund-Idempotency": idempotencyKey,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      }
    );

    const refund = (await razorpayResponse
      .json()
      .catch(() => null)) as RazorpayRefundResponse | null;

    // 12. Handle Razorpay errors
    if (!razorpayResponse.ok) {
      console.error("Razorpay refund API error:", {
        httpStatus: razorpayResponse.status,
        response: refund,
      });

      // Preserve pending status and idempotency key.
      // Reconciliation is required before another retry.
      return NextResponse.json(
        {
          success: false,
          message:
            "Razorpay did not confirm the refund. The order remains pending reconciliation. Check the Razorpay Dashboard before retrying.",
          razorpayError: refund,
        },
        { status: 502 }
      );
    }

    // 13. Validate Razorpay response
    if (
      !refund?.id ||
      refund.payment_id !== order.razorpayPaymentId ||
      refund.amount !== amount ||
      !refund.status
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Razorpay returned an incomplete or mismatched refund response. Reconcile the refund before retrying.",
        },
        { status: 502 }
      );
    }

    // 14. Save refund details
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: id,
        razorpayRefundIdempotencyKey: idempotencyKey,
        refundStatus: "pending",
      },
      {
        $set: {
          razorpayRefundId: refund.id,
          refundStatus: refund.status,
          ...(refund.status === "processed"
            ? { paymentStatus: "refunded" }
            : {}),
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Refund was created, but the order record could not be updated. Reconcile before retrying.",
          refundId: refund.id,
        },
        { status: 500 }
      );
    }

    // 15. Return result
    return NextResponse.json({
      success: true,
      message: "Refund request processed by Razorpay.",
      orderId: updatedOrder._id.toString(),
      refundId: refund.id,
      refundStatus: updatedOrder.refundStatus,
      paymentStatus: updatedOrder.paymentStatus,
    });
  } catch (error) {
    console.error("Refund request error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to confirm the refund request. Check the refund status before retrying.",
      },
      { status: 500 }
    );
  }
}
