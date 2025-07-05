import { GmailService } from "../../../services/gmail";
import { TelegramService } from "../../../services/telegram";
import { OAuth2Service } from "../../../services/OAuth2";
import { DatabaseService } from "../../../services/database";

export default async (request, context) => {
  const databaseService = new DatabaseService();

  try {
    const telegramService = new TelegramService();
    const refreshToken = await databaseService.getToken();
    const gmailService = new GmailService(refreshToken);

    const { emails, amountSum, error, errorCode } =
      await gmailService.checkNewPayPalEmails();
    console.log(
      "[/checkpaypalpayments]",
      "error",
      error,
      "errorCode",
      errorCode
    );

    if (error && errorCode === 1) {
      const oauth2Service = new OAuth2Service();
      const authUrl = oauth2Service.getAuthUrl();
      await telegramService.sendMessage(
        `Token expiré. \nURL d'authentification : \n${authUrl}`
      );
    } else {
      console.log("[/checkpaypalpayments]", "emails count", emails.length);
      console.log("[/checkpaypalpayments]", "amountSum", amountSum);
      const payPalBalance = await databaseService.getPayPalBalance();
      const newPayPalBalance = (
        parseFloat(amountSum) + parseFloat(payPalBalance)
      ).toFixed(2);
      console.log("[/checkpaypalpayments]", "payPalBalance", payPalBalance);
      console.log(
        "[/checkpaypalpayments]",
        "newPayPalBalance",
        newPayPalBalance
      );
      await databaseService.updatePayPalBalance(newPayPalBalance);
      
      for (const email of emails) {
        await telegramService.sendPayPalNotification(email);
        if (email.internalReference) {
          try {
            const result = await databaseService.markSimulationAsProcessed(email.internalReference);
            if (result.success) {
              await telegramService.sendMessage(`✅ Transaction ${email.internalReference} marquée comme traitée.`);
            } else {
              await telegramService.sendMessage(`❌ Impossible de marquer la transaction ${email.internalReference} comme traitée : ${result.message}`);
            }
          } catch (error) {
            console.error(`Erreur inattendue lors du traitement de la transaction ${email.internalReference}:`, error);
            await telegramService.sendMessage(`❌ Erreur inattendue lors du traitement de la transaction ${email.internalReference}.`);
          }
        }
      }
    }

    return Response.json(
      { "bulk length": emails ? emails.length : 0 },
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
  } finally {
    await databaseService.closeConnection();
  }
};

export const config = {
  path: "/checkpaypalpayments",
};
