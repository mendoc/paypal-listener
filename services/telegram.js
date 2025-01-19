const TelegramBot = require("node-telegram-bot-api");
const { telegram: telegramConfig } = require("./config");
const ImageGenerator = require("./ImageGenerator");

class TelegramService {
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

      // Message de notification
      const caption = `💸 Paiement PayPal envoyé !`;

      // Envoyer l'image avec la légende
      await this.bot.sendPhoto(telegramConfig.chatId, imageBuffer, {
        caption: caption,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi de l'image Telegram:", error);
    }
  }
}

module.exports = TelegramService;
