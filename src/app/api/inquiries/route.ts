import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Inquiry from "@/models/Inquiry";
import { createNotification } from "@/lib/notifications";
import { sendAdminNotification } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, email, phone, subject, message } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Name, email, subject and message are required.",
        },
        { status: 400 }
      );
    }

    if (
      name.trim().length > 100 ||
      email.trim().length > 254 ||
      subject.trim().length > 150 ||
      message.trim().length > 5000 ||
      (phone !== undefined &&
        (typeof phone !== "string" || phone.trim().length > 25))
    ) {
      return NextResponse.json(
        { success: false, message: "One or more fields exceed the allowed length." },
        { status: 400 }
      );
    }

    await connectDB();

    const inquiry = await Inquiry.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      ...(typeof phone === "string" && phone.trim()
        ? { phone: phone.trim() }
        : {}),
      subject: subject.trim(),
      message: message.trim(),
      status: "new",
    });

    try {
  await createNotification({
    title: "New Customer Inquiry",
    message: `${inquiry.name} submitted an inquiry: ${inquiry.subject}`,
    type: "inquiry",
    referenceId: inquiry._id,
  });
} catch (notificationError) {
  console.error(
    "Failed to create inquiry notification:",
    notificationError
  );
}
    // Send the existing admin email notification.
try {
  await sendAdminNotification(
    `New Customer Inquiry: ${inquiry.subject}`,
    [
      "A new customer inquiry has been submitted.",
      `Inquiry ID: ${inquiry._id}`,
      `Customer Name: ${inquiry.name}`,
      `Customer Email: ${inquiry.email}`,
      `Customer Phone: ${inquiry.phone ?? "Not provided"}`,
      `Subject: ${inquiry.subject}`,
      `Message: ${inquiry.message}`,
      `Status: ${inquiry.status}`,
    ].join("\n")
  );
} catch (emailError) {
  console.error(
    "Failed to send inquiry notification email:",
    emailError
  );
}

    return NextResponse.json(
      {
        success: true,
        message: "Your inquiry has been submitted successfully.",
        inquiry,
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

    console.error("Failed to submit inquiry:", error);

    return NextResponse.json(
      { success: false, message: "Failed to submit inquiry." },
      { status: 500 }
    );
  }
}
