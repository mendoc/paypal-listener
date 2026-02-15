import { GmailService } from "../../../services/gmail";
import { TelegramService } from "../../../services/telegram";
import { OAuth2Service } from "../../../services/OAuth2";
import { DatabaseService } from "../../../services/database";
import { ImageGenerator } from "../../../services/ImageGenerator";
import { FirestoreService } from "../../../services/firestore";

export default async (request, context) => {
  const databaseService = new DatabaseService();
  let firestoreService;

  try {
    // Initialiser FirestoreService seulement si la configuration est disponible
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      firestoreService = new FirestoreService();
    }

    const telegramService = new TelegramService();
    const imageGenerator = new ImageGenerator();
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
        `Token expiré. \nURL d\'authentification : \n${authUrl}`
      );
    } else if (emails && emails.length > 0) {
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

        if (email.type === "received" || email.type === "subscription" || email.type === "refund") {
          await telegramService.sendPayPalNotification(email);

          if (email.type === "subscription") {
            try {
              const montantEur = parseFloat(email.amount?.replace(/[^\d,]/g, "").replace(",", "."));
              const montant = Math.round(montantEur * 656);
              const categorie = `Abonnement ${email.merchant}`;
              const res = await fetch("https://miango.netlify.app/addexpense", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ montant, categorie }),
              });
              const result = await res.json();
              console.log("[/checkpaypalpayments]", "dépense enregistrée:", result);
              if (result.success) {
                await telegramService.sendMessage(
                  `✅ Dépense enregistrée !\n\n📂 Catégorie : ${categorie}\n💰 Montant : ${montant.toLocaleString("fr-FR")} FCFA (${montantEur} €)`
                );
              } else {
                await telegramService.sendMessage(`❌ Échec de l'enregistrement de la dépense pour ${email.merchant}.`);
              }
            } catch (err) {
              console.error("[/checkpaypalpayments]", "erreur enregistrement dépense:", err);
              await telegramService.sendMessage(`❌ Erreur lors de l'enregistrement de la dépense pour ${email.merchant}.`);
            }
          }

          continue;
        }

        const image = await imageGenerator.generatePaymentImage(email);
        await telegramService.sendPayPalNotification(email, image);
        if (email.internalReference) {
          try {
            const simulation = await databaseService.getSimulation(email.internalReference);
            let capture = null;
            let shouldEmitEvent = false;

            if (simulation && simulation.whatsapp) {
              capture = image.toString("base64");
              shouldEmitEvent = true;
            }

            const result = await databaseService.markSimulationAsProcessed(email.internalReference, capture);

            if (result.success) {
              await telegramService.sendMessage(`✅ Transaction ${email.internalReference} marquée comme traitée.`);
              // Émettre l'événement Firestore si nécessaire
              if (shouldEmitEvent && firestoreService) {
                await firestoreService.emitCaptureSaved("function-checkpaypalpayments", email.internalReference, simulation.whatsapp);
              }
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
