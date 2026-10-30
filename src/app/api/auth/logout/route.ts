
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    message: "Logged out successfully.",
  });

  response.cookies.set({
    name: "petcare_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
