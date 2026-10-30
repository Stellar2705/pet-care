import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Booking from "@/models/Booking";
import { sendEmail } from "@/lib/email";

// PATCH: Update a booking's status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
        { success: false, message: "Invalid booking ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "completed",
      "cancelled",
    ];

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid booking status." },
        { status: 400 }
      );
    }

    await connectDB();

    const booking = await Booking.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true }
    )
      .populate("customerId", "name email")
      .populate("petId", "name type breed")
      .populate("serviceId", "name category price duration")
      .select("-__v")
      .lean();

    if (!booking) {
      return NextResponse.json(
        { success: false, message: "Booking not found." },
        { status: 404 }
      );
    }


    const customer = booking.customerId as unknown as {
      name?: string;
      email?: string;
    };

    if (customer?.email) {
      await sendEmail(
        customer.email,
        `Pet Care Booking Update: ${booking._id}`,
        [
          `Hello ${customer.name || "Customer"},`,
          "",
          "Your pet care booking status has been updated.",
          `Booking ID: ${booking._id}`,
          `Service: ${booking.serviceId && typeof booking.serviceId === "object" && "name" in booking.serviceId ? booking.serviceId.name : "Your booked service"}`,
          `Date: ${booking.date.toISOString()}`,
          `Time slot: ${booking.slot}`,
          `New status: ${booking.status}`,
          "",
          "Thank you for choosing Pet Care.",
        ].join("\n")
      );
    } else {
      console.error("Booking status updated, but customer email was unavailable.");
    }


    return NextResponse.json({
      success: true,
      message: "Booking status updated successfully.",
      booking,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    console.error("Failed to update booking:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update booking." },
      { status: 500 }
    );
  }
}


export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Please log in to cancel a booking." },
        { status: 401 }
      );
    }

    const { id } = params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid booking ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const booking = await Booking.findById(id);

    if (!booking) {
      return NextResponse.json(
        { success: false, message: "Booking not found." },
        { status: 404 }
      );
    }

    // Customers can cancel only their own bookings.
    // Admins can cancel any booking.
    if (
      user.role !== "admin" &&
      booking.customerId.toString() !== user.id
    ) {
      return NextResponse.json(
        { success: false, message: "You cannot cancel another customer's booking." },
        { status: 403 }
      );
    }

    if (booking.status === "completed" || booking.status === "cancelled") {
      return NextResponse.json(
        { success: false, message: `A ${booking.status} booking cannot be cancelled again.` },
        { status: 409 }
      );
    }

    booking.status = "cancelled";
    await booking.save();

    return NextResponse.json({
      success: true,
      message: "Booking cancelled successfully.",
      bookingId: booking._id.toString(),
      status: booking.status,
    });
  } catch (error) {
    console.error("Failed to cancel booking:", error);

    return NextResponse.json(
      { success: false, message: "Failed to cancel booking." },
      { status: 500 }
    );
  }
}
