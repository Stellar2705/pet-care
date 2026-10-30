
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. Validate input
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Check the session secret
    const secret = process.env.AUTH_SECRET;

    if (!secret) {
      throw new Error("AUTH_SECRET is not configured.");
    }

    // 3. Connect to MongoDB
    await connectDB();

    // 4. Find the user and explicitly retrieve the password hash
    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 5. Compare the submitted password with its stored hash
    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 6. Create a signed session token
    const key = new TextEncoder().encode(secret);

    const token = await new SignJWT({
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user._id.toString())
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(key);

    // 7. Return safe user details and set an HTTP-only cookie
    const response = NextResponse.json({
      message: "Login successful.",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set({
      name: "petcare_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    console.error("Login error:", error);

    return NextResponse.json(
      { message: "Unable to log in right now." },
      { status: 500 }
    );
  }
}
