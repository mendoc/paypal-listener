import { GmailService } from "../../../services/gmail";
import { TelegramService } from "../../../services/telegram";

export default async (request, context) => {
  try {
    const gmailService = new GmailService();
    const telegramService = new TelegramService();

    const emails = await gmailService.checkNewPayPalEmails();
    for (const email of emails) {
      await telegramService.sendPayPalNotification(email);
    }

    return Response.json(
      { "bulk length": emails.length },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    return new Response(error.toString(), {
      status: 500,
    });
  }
};

export const config = {
  path: "/checkpaypalpayments",
};
