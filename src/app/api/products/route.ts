import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import Product from "@/models/Product";

// GET: Fetch all active products (public endpoint)

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const category = searchParams.get("category")?.trim();

    const filter: {
      isActive: boolean;
      category?: string;
      $or?: Array<Record<string, unknown>>;
    } = {
      isActive: true,
    };

    if (category) {
      filter.category = category;
    }

    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const products = await Product.find(filter)
      .select("-__v")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch products.",
      },
      { status: 500 }
    );
  }
}


// POST: Create a product (admin only)
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
    const { name, slug, description, price, category, images, stock } = body;

    if (
      typeof name !== "string" || !name.trim() || name.trim().length > 150 ||
      typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug.trim()) ||
      typeof description !== "string" || !description.trim() || description.length > 3000 ||
      typeof price !== "number" || !Number.isFinite(price) || price < 0 ||
      typeof category !== "string" || !category.trim() || category.trim().length > 100 ||
      (images !== undefined && (
        !Array.isArray(images) ||
        !images.every((image: unknown) => typeof image === "string" && image.length <= 2048)
      )) ||
      (stock !== undefined && (
        typeof stock !== "number" || !Number.isInteger(stock) || stock < 0
      ))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product details." },
        { status: 400 }
      );
    }

    await connectDB();

    const normalizedSlug = slug.trim().toLowerCase();

    const existingProduct = await Product.findOne({ slug: normalizedSlug }).lean();

    if (existingProduct) {
      return NextResponse.json(
        { success: false, message: "A product with this slug already exists." },
        { status: 409 }
      );
    }

    const product = await Product.create({
      name: name.trim(),
      slug: normalizedSlug,
      description: description.trim(),
      price,
      category: category.trim(),
      images: images ?? [],
      stock: stock ?? 0,
      isActive: true,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Product created successfully.",
        product,
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
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { success: false, message: "A product with this slug already exists." },
        { status: 409 }
      );
    }

    console.error("Product creation failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create product." },
      { status: 500 }
    );
  }
}
