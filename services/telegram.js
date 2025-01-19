import TelegramBot from "node-telegram-bot-api";
import { telegram as telegramConfig } from "./config";
import { ImageGenerator } from "./ImageGenerator";
import { Buffer } from "buffer";

export class TelegramService {
  constructor() {
    this.bot = new TelegramBot(telegramConfig.botToken, { polling: false });
    this.imageGenerator = new ImageGenerator();
  }

  async sendPayPalNotification(paymentInfo) {
    if (paymentInfo.type === "sent") {
      await this.sendSentPaymentNotification(paymentInfo);
    } else {
      await this.sendReceivedPaymentNotification(paymentInfo);
    }
  }

  async sendReceivedPaymentNotification(paymentInfo) {
    const message = `
💰 Nouveau paiement PayPal reçu !

👤 De : ${paymentInfo.sender}
💵 Montant : *${paymentInfo.amount}*
📅 Date : ${paymentInfo.date}
🕒 Heure : ${paymentInfo.time}
🔢 Référence : ${paymentInfo.reference}
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi du message Telegram:", error);
    }
  }

  async sendSentPaymentNotification(paymentInfo) {
    try {
      // Générer l'image
      const imageBuffer = await this.imageGenerator.generatePaymentImage(
        paymentInfo
      );

      console.log(`Taille de l'image : ${imageBuffer.length / 1024} KB`);

      // Message de notification
      const caption = `💸 Paiement PayPal envoyé !`;

      // Envoyer l'image avec la légende
      await this.bot.sendPhoto(
        telegramConfig.chatId,
        imageBuffer,
        {},
        {
          caption: caption,
          parse_mode: "Markdown",
          // Explicitly specify the file name.
          filename: `paypal_receipt_${paymentInfo.reference}.png`,
          // Explicitly specify the MIME type.
          contentType: "application/octet-stream",
        }
      );
    } catch (error) {
      console.error("Erreur lors de l'envoi de l'image Telegram:", error);
      // En cas d'erreur, on envoie au moins un message texte
      await this.sendFallbackMessage(paymentInfo);
    }
  }

  async sendFallbackMessage(paymentInfo) {
    const message = `
💸 Paiement PayPal envoyé !

👤 À : ${paymentInfo.recipient}
💵 Montant : *${paymentInfo.amount}*
📅 Date : ${paymentInfo.date}
🕒 Heure : ${paymentInfo.time}
🔢 Référence : ${paymentInfo.reference}
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi du message de secours:", error);
    }
  }
}
