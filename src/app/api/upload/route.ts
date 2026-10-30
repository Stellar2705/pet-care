
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import cloudinary from "@/lib/cloudinary";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'Select an image in the "file" field.' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, message: "Only image files are allowed." },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, message: "Image must be 5 MB or smaller." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, message: "The selected file is empty." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "pet-care",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result) {
            reject(new Error("Cloudinary returned no upload result."));
            return;
          }

          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );

      Readable.from(buffer).pipe(uploadStream);
    });

    return NextResponse.json(
      {
        success: true,
        message: "Image uploaded successfully.",
        imageUrl: result.secure_url,
        publicId: result.public_id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Image upload failed:", error);

    return NextResponse.json(
      { success: false, message: "Image upload failed." },
      { status: 500 }
    );
  }
}
