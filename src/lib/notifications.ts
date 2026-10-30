
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { Types } from "mongoose";

interface CreateNotificationInput {
  title: string;
  message: string;
  type: "order" | "booking" | "inquiry";
  referenceId: string | Types.ObjectId;
}

export async function createNotification(
  data: CreateNotificationInput
) {
  try {
    if (!Types.ObjectId.isValid(data.referenceId)) {
      throw new Error("Invalid notification reference ID.");
    }

    await connectDB();

    const notification = await Notification.create({
      title: data.title,
      message: data.message,
      type: data.type,
      referenceId: new Types.ObjectId(data.referenceId),
      isRead: false,
    });

    return notification;
  } catch (error) {
    console.error("Notification creation failed:", error);
    throw error;
  }
}
