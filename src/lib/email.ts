
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(
  recipient: string,
  subject: string,
  message: string
): Promise<boolean> {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!process.env.RESEND_API_KEY || !recipient || !fromEmail) {
    console.error("Email skipped: required configuration is missing.");
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      subject,
      text: message,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return false;
    }

    console.log("Email accepted by Resend. Email ID:", data?.id);
    return true;
  } catch (error) {
    console.error("Email notification error:", error);
    return false;
  }
}

export async function sendAdminNotification(
  subject: string,
  message: string
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.error("Admin email skipped: ADMIN_EMAIL is missing.");
    return false;
  }

  return sendEmail(adminEmail, subject, message);
}
