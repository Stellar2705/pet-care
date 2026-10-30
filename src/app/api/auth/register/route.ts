
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, email, password } = body;

    // 1. Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Name, email and password are required." },
        { status: 400 }
      );
    }

    // 2. Validate input types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        { message: "Invalid input types." },
        { status: 400 }
      );
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      !normalizedName ||
      normalizedName.length > 100 ||
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return NextResponse.json(
        { message: "Please provide a valid name and email." },
        { status: 400 }
      );
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters and no more than 72 UTF-8 bytes." },
        { status: 400 }
      );
    }

    await connectDB();

    // 3. Check for an existing account
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // 4. Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5. Create the account. Public registration always creates a customer.
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "customer",
    });

    // 6. Return safe user information only
    return NextResponse.json(
      {
        message: "Registration successful.",
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Handle duplicate emails even if two requests race.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);

    return NextResponse.json(
      { message: "Unable to register right now." },
      { status: 500 }
    );
  }
}
