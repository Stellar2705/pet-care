import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Booking from "@/models/Booking";
import Pet from "@/models/Pet";
import Service from "@/models/Service";
import { sendAdminNotification } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Please log in to book a service." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { petId, serviceId, date, slot, atHomeOrCenter, address, notes } =
      body;

    if (
      typeof petId !== "string" ||
      !mongoose.isValidObjectId(petId) ||
      typeof serviceId !== "string" ||
      !mongoose.isValidObjectId(serviceId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid pet or service ID." },
        { status: 400 }
      );
    }

    if (
      typeof date !== "string" ||
      typeof slot !== "string" ||
      !slot.trim() ||
      !["home", "center"].includes(atHomeOrCenter)
    ) {
      return NextResponse.json(
        { success: false, message: "Please provide valid booking details." },
        { status: 400 }
      );
    }

const slotPattern = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;

if (!slotPattern.test(slot.trim())) {
  return NextResponse.json(
    {
      success: false,
      message: "Invalid time slot. Use a format such as 10:00 AM.",
    },
    { status: 400 }
  );
}


    if (
      (address !== undefined &&
        (typeof address !== "string" || address.length > 500)) ||
      (notes !== undefined &&
        (typeof notes !== "string" || notes.length > 1000))
    ) {
      return NextResponse.json(
        { success: false, message: "Address or notes are invalid." },
        { status: 400 }
      );
    }

    if (
      atHomeOrCenter === "home" &&
      (typeof address !== "string" || !address.trim())
    ) {
      return NextResponse.json(
        { success: false, message: "An address is required for home service." },
        { status: 400 }
      );
    }

    const bookingDate = new Date(date);

    if (
      Number.isNaN(bookingDate.getTime()) ||
      bookingDate.getTime() <= Date.now()
    )
     {
      return NextResponse.json(
        { success: false, message: "Choose a valid future booking date." },
        { status: 400 }
      );
    }
    if (slot.trim().length > 100) {
        return NextResponse.json(
    {
      success: false,
      message: "Time slot must be 100 characters or fewer.",
    },
    { status: 400 }
  );
}

    await connectDB();

    const [pet, service] = await Promise.all([
      Pet.findOne({ _id: petId, ownerId: user.id }).lean(),
      Service.findOne({ _id: serviceId, isActive: true }).lean(),
    ]);

    if (!pet) {
      return NextResponse.json(
        { success: false, message: "Pet not found in your account." },
        { status: 404 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { success: false, message: "Service not found or unavailable." },
        { status: 404 }
      );
    }

    if (!service.forPetType.includes(pet.type)) {
      return NextResponse.json(
        {
          success: false,
          message: "This service is not available for your pet type.",
        },
        { status: 400 }
      );
    }


const existingBooking = await Booking.findOne({
  serviceId,
  date: bookingDate,
  slot: slot.trim(),
  atHomeOrCenter,
  status: { $in: ["pending", "confirmed"] },
}).lean();

if (existingBooking) {
  return NextResponse.json(
    {
      success: false,
      message: "This appointment slot is already booked. Please choose another time.",
    },
    { status: 409 }
  );
}


    const booking = await Booking.create({
      customerId: user.id,
      petId,
      serviceId,
      date: bookingDate,
      slot: slot.trim(),
      atHomeOrCenter,
      ...(address !== undefined ? { address: address.trim() } : {}),
      ...(notes !== undefined ? { notes: notes.trim() } : {}),
      status: "pending",
    });



try {
  await createNotification({
    title: "New Booking Received",
    message: `A new booking has been created for ${booking.date.toLocaleDateString("en-IN")}.`,
    type: "booking",
    referenceId: booking._id,
  });
} catch (notificationError) {
  console.error(
    "Failed to create booking notification:",
    notificationError
  );
}

    // Keep the existing admin email notification.
try {
  await sendAdminNotification(
    `New Pet Care Booking: ${booking._id}`,
    [
      "A new service booking has been created.",
      `Booking ID: ${booking._id}`,
      `Customer ID: ${booking.customerId}`,
      `Pet ID: ${booking.petId}`,
      `Service ID: ${booking.serviceId}`,
      `Date: ${booking.date.toISOString()}`,
      `Time slot: ${booking.slot}`,
      `Location: ${booking.atHomeOrCenter}`,
      `Address: ${booking.address ?? "Not provided"}`,
      `Status: ${booking.status}`,
    ].join("\n")
  );
} catch (emailError) {
  console.error(
    "Failed to send booking notification email:",
    emailError
  );
}



    return NextResponse.json(
      {
        success: true,
        message: "Booking created successfully.",
        booking,
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

    console.error("Booking creation failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create booking." },
      { status: 500 }
    );
  }
}



export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Please log in to view bookings." },
        { status: 401 }
      );
    }

    await connectDB();

    // Admins can view all bookings; customers only see their own.
    const filter =
      user.role === "admin" ? {} : { customerId: user.id };

    const bookings = await Booking.find(filter)
      .populate("customerId", "name email")
      .populate("petId", "name type breed")
      .populate("serviceId", "name category price duration")
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Failed to fetch bookings:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch bookings." },
      { status: 500 }
    );
  }
}
