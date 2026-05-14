/*
 * Variables d'environnement requises :
 *   MAILGUN_SIGNING_KEY              — clé de vérification de signature Mailgun
 *   TELEGRAM_BOT_TOKEN               — hérité
 *   TELEGRAM_CHAT_ID                 — hérité
 *   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT — hérité
 *   FIREBASE_SERVICE_ACCOUNT_JSON    — hérité (optionnel)
 */

import { createHmac } from "crypto";
import { TelegramService } from "../../../services/telegram";
import { DatabaseService } from "../../../services/database";
import { ImageGenerator } from "../../../services/ImageGenerator";
import { FirestoreService } from "../../../services/firestore";
import { getEmailType, parsePayPalEmail } from "../../../services/emailParser";

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response("Method Not Acceptable", { status: 406 });
  }

  const databaseService = new DatabaseService();
  let firestoreService;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      firestoreService = new FirestoreService();
    }

    const formData = await request.formData();
    const sender = formData.get("sender") || "";
    const subject = formData.get("subject") || "";
    const bodyHtml = formData.get("body-html") || "";
    const bodyPlain = formData.get("body-plain") || "";
    const messageId = formData.get("Message-Id") || formData.get("message-id") || "";
    const timestamp = formData.get("timestamp") || "";
    const token = formData.get("token") || "";
    const signature = formData.get("signature") || "";
    const messageHeadersRaw = formData.get("message-headers") || "[]";

    console.log("[handlepaypalpayments]", "sender:", sender, "subject:", subject, "messageId:", messageId);

    const signingKey = process.env.MAILGUN_SIGNING_KEY;
    if (!signingKey) {
      console.error("[handlepaypalpayments]", "MAILGUN_SIGNING_KEY manquante");
      return Response.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    const computedSignature = createHmac("sha256", signingKey)
      .update(timestamp + token)
      .digest("hex");
    if (computedSignature !== signature) {
      console.log("[handlepaypalpayments]", "Signature invalide");
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (sender !== "service@paypal.fr") {
      console.log("[handlepaypalpayments]", "Sender ignoré:", sender);
      return Response.json({ ignored: true });
    }

    if (messageId) {
      const alreadyProcessed = await databaseService.hasProcessedEmail(messageId);
      if (alreadyProcessed) {
        console.log("[handlepaypalpayments]", "Email déjà traité:", messageId);
        return Response.json({ duplicate: true });
      }
    }

    let emailDate = "";
    try {
      const messageHeaders = JSON.parse(messageHeadersRaw);
      const dateHeader = messageHeaders.find(([name]) => name === "Date");
      if (dateHeader) emailDate = dateHeader[1];
    } catch {
      console.log("[handlepaypalpayments]", "Impossible de parser message-headers");
    }

    const emailType = getEmailType(subject);
    if (!emailType) {
      console.log("[handlepaypalpayments]", "Type d'email inconnu, sujet:", subject);
      return Response.json({ ignored: true });
    }

    const emailContent = bodyHtml || bodyPlain;
    const parsedEmail = parsePayPalEmail(emailType, emailDate, emailContent);
    if (!parsedEmail) {
      console.log("[handlepaypalpayments]", "Parsing échoué pour le type:", emailType);
      return Response.json({ ignored: true });
    }

    console.log("[handlepaypalpayments]", "email parsé:", parsedEmail);

    const currentAmount = parseFloat(
      parsedEmail.amount?.replace(/[^\d,]/g, "").replace(",", ".")
    ) || 0;
    const sign = emailType === "received" ? 1 : -1;
    const payPalBalance = await databaseService.getPayPalBalance();
    const newPayPalBalance = (parseFloat(payPalBalance) + currentAmount * sign).toFixed(2);
    await databaseService.updatePayPalBalance(newPayPalBalance);
    console.log("[handlepaypalpayments]", "payPalBalance:", payPalBalance, "→", newPayPalBalance);

    const telegramService = new TelegramService();
    const imageGenerator = new ImageGenerator();

    if (emailType === "received" || emailType === "subscription" || emailType === "refund") {
      await telegramService.sendPayPalNotification(parsedEmail);

      if (emailType === "subscription") {
        try {
          const montantEur = parseFloat(parsedEmail.amount?.replace(/[^\d,]/g, "").replace(",", "."));
          const montant = Math.round(montantEur * 656);
          const categorie = `Abonnement ${parsedEmail.merchant}`;
          const res = await fetch("https://miango.netlify.app/addexpense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ montant, categorie }),
          });
          const result = await res.json();
          console.log("[handlepaypalpayments]", "dépense enregistrée:", result);
          if (result.success) {
            await telegramService.sendMessage(
              `✅ Dépense enregistrée !\n\n📂 Catégorie : ${categorie}\n💰 Montant : ${montant.toLocaleString("fr-FR")} FCFA (${montantEur} €)`
            );
          } else {
            await telegramService.sendMessage(`❌ Échec de l'enregistrement de la dépense pour ${parsedEmail.merchant}.`);
          }
        } catch (err) {
          console.error("[handlepaypalpayments]", "erreur enregistrement dépense:", err);
          await telegramService.sendMessage(`❌ Erreur lors de l'enregistrement de la dépense pour ${parsedEmail.merchant}.`);
        }
      }
    } else {
      const image = await imageGenerator.generatePaymentImage(parsedEmail);
      await telegramService.sendPayPalNotification(parsedEmail, image);

      if (parsedEmail.internalReference) {
        try {
          const simulation = await databaseService.getSimulation(parsedEmail.internalReference);
          let capture = null;
          let shouldEmitEvent = false;

          if (simulation && simulation.whatsapp) {
            capture = image.toString("base64");
            shouldEmitEvent = true;
          }

          const result = await databaseService.markSimulationAsProcessed(parsedEmail.internalReference, capture);

          if (result.success) {
            await telegramService.sendMessage(`✅ Transaction ${parsedEmail.internalReference} marquée comme traitée.`);
            if (shouldEmitEvent && firestoreService) {
              await firestoreService.emitCaptureSaved("function-handlepaypalpayments", parsedEmail.internalReference, simulation.whatsapp);
            }
          } else {
            await telegramService.sendMessage(`❌ Impossible de marquer la transaction ${parsedEmail.internalReference} comme traitée : ${result.message}`);
          }
        } catch (error) {
          console.error(`[handlepaypalpayments] Erreur lors du traitement de la transaction ${parsedEmail.internalReference}:`, error);
          await telegramService.sendMessage(`❌ Erreur inattendue lors du traitement de la transaction ${parsedEmail.internalReference}.`);
        }
      }
    }

    if (messageId) {
      await databaseService.markEmailAsProcessed(messageId);
    }

    return Response.json({
      success: true,
      transactionId: parsedEmail.internalReference || parsedEmail.reference,
    });
  } catch (error) {
    console.error("[handlepaypalpayments]", "Erreur inattendue:", error);
    return Response.json({ error: error.toString() }, { status: 500 });
  } finally {
    await databaseService.closeConnection();
  }
};

export const config = {
  path: "/handlepaypalpayments",
};
