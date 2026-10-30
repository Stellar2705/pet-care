
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Pet from "@/models/Pet";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the user's session
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { message: "Please log in to add a pet." },
        { status: 401 }
      );
    }

    // 2. Read and validate the request body
    const body = await request.json();
    const { name, type, breed, age } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100
    ) {
      return NextResponse.json(
        { message: "A valid pet name is required." },
        { status: 400 }
      );
    }

    if (type !== "dog" && type !== "cat") {
      return NextResponse.json(
        { message: "Pet type must be dog or cat." },
        { status: 400 }
      );
    }

    if (
      breed !== undefined &&
      (typeof breed !== "string" || breed.trim().length > 100)
    ) {
      return NextResponse.json(
        { message: "Breed must be a string of at most 100 characters." },
        { status: 400 }
      );
    }

    if (
      age !== undefined &&
      (typeof age !== "number" ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > 100)
    ) {
      return NextResponse.json(
        { message: "Age must be a number between 0 and 100." },
        { status: 400 }
      );
    }

    // 3. Connect to MongoDB
    await connectDB();

    // 4. Create a pet owned by the authenticated user
    const pet = await Pet.create({
      ownerId: user.id,
      name: name.trim(),
      type,
      ...(breed?.trim() ? { breed: breed.trim() } : {}),
      ...(age !== undefined ? { age } : {}),
    });

    // 5. Return the newly created pet
    return NextResponse.json(
      {
        message: "Pet added successfully.",
        pet,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { message: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    console.error("Create pet error:", error);

    return NextResponse.json(
      { message: "Unable to add pet right now." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Only logged-in users can view their pet profiles
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { message: "Please log in to view your pets." },
        { status: 401 }
      );
    }

    await connectDB();

    const pets = await Pet.find({ ownerId: user.id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ pets });
  } catch (error) {
    console.error("Fetch pets error:", error);

    return NextResponse.json(
      { message: "Unable to fetch pets right now." },
      { status: 500 }
    );
  }
}
