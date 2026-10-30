
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Service from "@/models/Service";

// GET: Fetch all active services (public endpoint)
export async function GET() {
  try {
    await connectDB();

    const services = await Service.find({ isActive: true })
      .select("-__v")
      .sort({ category: 1, name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: services.length,
      services,
    });
  } catch (error) {
    console.error("Failed to fetch services:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch services.",
      },
      { status: 500 }
    );
  }
}

// POST: Create a service (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      name,
      slug,
      category,
      description,
      price,
      duration,
      forPetType,
    } = body;

    // Validate required fields
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 150 ||
      typeof slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug.trim()) ||
      !["grooming", "boarding", "vet"].includes(category) ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      !Array.isArray(forPetType) ||
      forPetType.length === 0 ||
      !forPetType.every(
        (type: unknown) => type === "dog" || type === "cat"
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid service details." },
        { status: 400 }
      );
    }

    // Validate optional description and prevent duplicate pet types
    if (
      (description !== undefined &&
        (typeof description !== "string" ||
          description.length > 2000)) ||
      new Set(forPetType).size !== forPetType.length
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid description or duplicate pet types.",
        },
        { status: 400 }
      );
    }

    await connectDB();

    const normalizedSlug = slug.trim().toLowerCase();

    // Check whether this slug already exists
    const existingService = await Service.findOne({
      slug: normalizedSlug,
    }).lean();

    if (existingService) {
      return NextResponse.json(
        {
          success: false,
          message: "A service with this slug already exists.",
        },
        { status: 409 }
      );
    }

    // Save the new service to MongoDB
    const service = await Service.create({
      name: name.trim(),
      slug: normalizedSlug,
      category,
      description: description?.trim(),
      price,
      duration,
      forPetType,
      isActive: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Service created successfully.",
        service,
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

    // Handle duplicate slugs, including concurrent requests
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A service with this slug already exists.",
        },
        { status: 409 }
      );
    }

    console.error("Service creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create service.",
      },
      { status: 500 }
    );
  }
}
