import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/email";
import Product from "@/models/Product";
import Order from "@/models/Order";
import { createNotification } from "@/lib/notifications";

// POST: Place an order

export async function POST(request: NextRequest) {
  let session: mongoose.ClientSession | null = null;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Please log in to place an order." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items, shippingAddress } = body;

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50 ||
      typeof shippingAddress !== "string" ||
      !shippingAddress.trim() ||
      shippingAddress.trim().length > 500
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid order details." },
        { status: 400 }
      );
    }

    const quantities = new Map<string, number>();

    for (const item of items) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !mongoose.isValidObjectId(item.productId) ||
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid product ID or quantity." },
          { status: 400 }
        );
      }

      const productId = item.productId.toLowerCase();
      const newQuantity =
        (quantities.get(productId) ?? 0) + item.quantity;

      if (newQuantity > 100) {
        return NextResponse.json(
          {
            success: false,
            message: "Maximum quantity per product is 100.",
          },
          { status: 400 }
        );
      }

      quantities.set(productId, newQuantity);
    }

    await connectDB();

    const productIds = [...quantities.keys()];
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
    }).lean();

    if (products.length !== productIds.length) {
      return NextResponse.json(
        {
          success: false,
          message: "One or more products are unavailable.",
        },
        { status: 400 }
      );
    }

    const orderItems: {
    productId: mongoose.Types.ObjectId;
    name: string;
    price: number;
    quantity: number;
    }[] = [];
    let totalAmount = 0;

    for (const product of products) {
      const quantity = quantities.get(product._id.toString())!;

      if (product.stock < quantity) {
        return NextResponse.json(
          {
            success: false,
            message: `Insufficient stock for ${product.name}.`,
          },
          { status: 409 }
        );
      }

      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity,
      });

      totalAmount += product.price * quantity;
    }

    totalAmount =
      Math.round((totalAmount + Number.EPSILON) * 100) / 100;

    // Reserve stock and create the order atomically.
    session = await mongoose.startSession();

    let createdOrder: InstanceType<typeof Order> | null = null;

    await session.withTransaction(async () => {
      // Conditional updates prevent stock from going below zero.
      for (const [productId, quantity] of quantities.entries()) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: productId,
            isActive: true,
            stock: { $gte: quantity },
          },
          { $inc: { stock: -quantity } },
          { new: true, session }
        );

        if (!updatedProduct) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      }

      const orders = await Order.create(
        [
          {
            customerId: user.id,
            items: orderItems,
            totalAmount,
            shippingAddress: shippingAddress.trim(),
            paymentStatus: "pending",
            orderStatus: "pending",
            stockDeducted: true,
            stockRestored: false,
          },
        ],
        { session }
      );

      createdOrder = orders[0];
    });
    const order = createdOrder as InstanceType<typeof Order> | null;


if (order) {
  // Create an in-app admin notification.
  // Notification failure should not undo a successfully placed order.
  try {
    await createNotification({
      title: "New Order Received",
      message: `A new order worth ₹${order.totalAmount} has been placed.`,
      type: "order",
      referenceId: order._id,
    });
  } catch (notificationError) {
    console.error(
      "Failed to create order notification:",
      notificationError
    );
  }

 // Send the existing admin email notification.
try {
  await sendAdminNotification(
    `New Pet Care Order: ${order._id}`,
    [
      "A new order has been placed.",
      `Order ID: ${order._id}`,
      `Customer ID: ${order.customerId}`,
      `Total Amount: ₹${order.totalAmount}`,
      `Order Status: ${order.orderStatus}`,
      `Shipping Address: ${order.shippingAddress}`,
    ].join("\n")
  );
} catch (emailError) {
  console.error(
    "Failed to send order notification email:",
    emailError
  );
}
}


    return NextResponse.json(
      {
        success: true,
        message: "Order placed successfully.",
        order: createdOrder,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Stock changed during checkout. Please check availability and try again.",
        },
        { status: 409 }
      );
    }

    console.error("Order creation failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to place order." },
      { status: 500 }
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}



export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Please log in to view your orders." },
        { status: 401 }
      );
    }

    await connectDB();

    const orders = await Order.find({ customerId: user.id })
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Failed to fetch orders:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch orders." },
      { status: 500 }
    );
  }
}
