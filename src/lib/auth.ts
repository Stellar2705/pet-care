
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export type AuthenticatedUser = {
  id: string;
  role: "customer" | "admin";
};

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    const token = request.cookies.get("petcare_session")?.value;
    const secret = process.env.AUTH_SECRET;

    if (!token || !secret) {
      return null;
    }

    const key = new TextEncoder().encode(secret);

    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    if (
      protectedHeader.alg !== "HS256" ||
      typeof payload.sub !== "string" ||
      (payload.role !== "customer" && payload.role !== "admin")
    ) {
      return null;
    }

    return {
      id: payload.sub,
      role: payload.role,
    };
  } catch {
    // Missing, invalid, tampered or expired session.
    return null;
  }
}
