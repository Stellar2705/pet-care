import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { sendEmail } from "@/lib/email";

// PATCH: Update order status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let session: mongoose.ClientSession | null = null;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { orderStatus } = body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (
      typeof orderStatus !== "string" ||
      !allowedStatuses.includes(orderStatus)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid order status." },
        { status: 400 }
      );
    }

    await connectDB();

    session = await mongoose.startSession();

    let errorMessage = "";
    let errorStatus = 400;

    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);

      if (!order) {
        errorMessage = "ORDER_NOT_FOUND";
        errorStatus = 404;
        return;
      }

      if (order.orderStatus === "cancelled") {
        errorMessage = "ORDER_ALREADY_CANCELLED";
        errorStatus = 409;
        return;
      }

      if (order.orderStatus === "delivered") {
        errorMessage = "DELIVERED_ORDER_CANNOT_BE_CHANGED";
        errorStatus = 409;
        return;
      }
      if (orderStatus !== "cancelled" &&
        order.paymentStatus !== "paid"
      ) {
      errorMessage = "PAYMENT_REQUIRED";
      errorStatus = 409;
      return;
      }

      if (orderStatus === "cancelled") {
        if (
          order.stockDeducted === true &&
          order.stockRestored !== true
        ) {
          for (const item of order.items) {
            const result = await Product.updateOne(
              { _id: item.productId },
              { $inc: { stock: item.quantity } },
              { session: session! }
            );

            if (result.matchedCount !== 1) {
              throw new Error("PRODUCT_NOT_FOUND_FOR_RESTOCK");
            }
          }

          order.stockRestored = true;
        }
      }

      order.orderStatus = orderStatus as
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled";

      await order.save({ session });
    });

    if (errorMessage) {
      const messages: Record<string, string> = {
        ORDER_NOT_FOUND: "Order not found.",
        ORDER_ALREADY_CANCELLED: "This order is already cancelled.",
        DELIVERED_ORDER_CANNOT_BE_CHANGED:
          "A delivered order cannot be changed.",
        PAYMENT_REQUIRED:
          "Payment must be completed before confirming or progressing this order.",
      };

      return NextResponse.json(
        { success: false, message: messages[errorMessage] },
        { status: errorStatus }
      );
    }

    const updatedOrder = await Order.findById(id)
      .populate("customerId", "name email")
      .populate("items.productId", "name category")
      .select("-__v")
      .lean();


    if (updatedOrder) {
      const customer = updatedOrder.customerId as unknown as {
        name?: string;
        email?: string;
      };

      if (customer?.email) {
        await sendEmail(
          customer.email,
          `Pet Care Order Update: ${id}`,
          [
            `Hello ${customer.name || "Customer"},`,
            "",
            "Your pet care order status has been updated.",
            `Order ID: ${id}`,
            `Total amount: ₹${updatedOrder.totalAmount}`,
            `Payment status: ${updatedOrder.paymentStatus}`,
            `New order status: ${updatedOrder.orderStatus}`,
            "",
            "Thank you for choosing Pet Care.",
          ].join("\n")
        );
      } else {
        console.error(
          "Order status updated, but customer email was unavailable."
        );
      }
    }


    return NextResponse.json({
      success: true,
      message:
        orderStatus === "cancelled"
          ? "Order cancelled successfully. Eligible stock has been restored."
          : "Order status updated successfully.",
      order: updatedOrder,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "PRODUCT_NOT_FOUND_FOR_RESTOCK"
    ) {
      console.error("A product needed for stock restoration was not found.");
    } else {
      console.error("Failed to update order status:", error);
    }

    return NextResponse.json(
      { success: false, message: "Failed to update order status." },
      { status: 500 }
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
