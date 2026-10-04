import TelegramBot from "node-telegram-bot-api";
import { telegram as telegramConfig } from "./config";
import { ImageGenerator } from "./ImageGenerator";
import { describeMatchFailure } from "./paymentMatcher";

// Les notifications de diagnostic partent en parse_mode HTML : un nom
// d'expéditeur ou un message d'erreur contenant _ ou * ferait rejeter un
// message Markdown par Telegram (400), et l'explication serait perdue au
// moment précis où elle est nécessaire.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class TelegramService {
  constructor() {
    this.bot = new TelegramBot(telegramConfig.botToken, { polling: false });
    this.imageGenerator = new ImageGenerator();
  }

  async sendPayPalNotification(paymentInfo, imageBuffer = null) {
    if (paymentInfo.type === "sent") {
      await this.sendSentPaymentNotification(paymentInfo, imageBuffer);
    } else if (paymentInfo.type === "subscription") {
      await this.sendSubscriptionPaymentNotification(paymentInfo);
    } else if (paymentInfo.type === "refund") {
      await this.sendRefundNotification(paymentInfo);
    } else {
      await this.sendReceivedPaymentNotification(paymentInfo);
    }
  }

  async sendReceivedPaymentNotification(paymentInfo) {
    const fees = paymentInfo.fees || "0,00 € EUR";
    let message = `
💰 Nouveau paiement PayPal reçu !

👤 De : ${paymentInfo.sender}
💵 Montant : *${paymentInfo.amount}*
💳 Frais : *${fees}*
📅 Date : ${paymentInfo.date}
🕒 Heure : ${paymentInfo.time}
🔢 Référence : ${paymentInfo.reference}
`;

    if (paymentInfo.match) {
      message += `🔗 Simulation : ${paymentInfo.match.reference}\n📱 WhatsApp : ${paymentInfo.match.whatsapp}\n`;
    }

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        "[sendReceivedPaymentNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  async sendReceivedPaymentImage(imageBuffer, reference) {
    try {
      await this.bot.sendPhoto(
        telegramConfig.chatId,
        imageBuffer,
        {},
        {
          filename: `paypal_received_${reference}.png`,
          contentType: "image/png",
        }
      );
    } catch (error) {
      console.error(
        "[sendReceivedPaymentImage@TelegramService]",
        "Erreur lors de l'envoi de l'image Telegram:",
        error
      );
    }
  }

  /**
   * Explique pourquoi un paiement reçu n'a pas été rapproché d'une simulation.
   * Sans ce message, la raison n'existe que dans les logs Netlify, alors que
   * la conséquence (pas de transfert, pas de message au client) est immédiate.
   * @param {object} paymentInfo Le mail parsé, pour rappeler le contexte.
   * @param {string} reason La raison renvoyée par le PaymentMatcher.
   */
  async sendMatchFailureNotification(paymentInfo, reason) {
    const message = `
⚠️ Paiement reçu non rapproché

🧐 Raison : <b>${escapeHtml(describeMatchFailure(reason))}</b>

👤 Expéditeur : ${escapeHtml(paymentInfo.sender || "introuvable")}
💵 Montant : ${escapeHtml(paymentInfo.amount || "introuvable")}
💳 Frais : ${escapeHtml(paymentInfo.fees || "0,00 € EUR")}
🔢 Référence PayPal : ${escapeHtml(paymentInfo.reference || "introuvable")}

👉 Aucun transfert Airtel Money n'a été lancé et le client n'a pas été prévenu : à traiter à la main.
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error(
        "[sendMatchFailureNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  /**
   * Signale qu'une erreur a interrompu le rapprochement. Le bloc appelant avale
   * l'erreur pour ne pas perdre la notification de paiement : sans ce message,
   * l'échec est totalement silencieux côté Telegram.
   * @param {object} paymentInfo Le mail parsé, pour rappeler le contexte.
   * @param {Error} error L'erreur levée pendant le rapprochement.
   */
  async sendMatchErrorNotification(paymentInfo, error) {
    const message = `
❌ Rapprochement du paiement reçu en erreur

👤 Expéditeur : ${escapeHtml(paymentInfo.sender || "introuvable")}
💵 Montant : ${escapeHtml(paymentInfo.amount || "introuvable")}
🔢 Référence PayPal : ${escapeHtml(paymentInfo.reference || "introuvable")}

🛠 Erreur : ${escapeHtml(error?.message || error)}

👉 Aucun transfert Airtel Money n'a été lancé et le client n'a pas été prévenu : à traiter à la main.
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "HTML",
      });
    } catch (sendError) {
      console.error(
        "[sendMatchErrorNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        sendError
      );
    }
  }

  async sendTransferInitiatedNotification(transferInfo) {
    const message = `
🚀 Transfert Airtel Money initié !

🔗 Simulation : ${transferInfo.reference}
📞 Numéro : ${transferInfo.phoneNumber}
💰 Montant : *${transferInfo.amount} F CFA*
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        "[sendTransferInitiatedNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  async sendSubscriptionPaymentNotification(paymentInfo) {
    let message = `
🔔 Paiement d'abonnement PayPal !

🏪 Marchand : ${paymentInfo.merchant}
💵 Montant : *${paymentInfo.amount}*
📅 Date : ${paymentInfo.date}
🕒 Heure : ${paymentInfo.time}`;

    if (paymentInfo.orderNumber) {
      message += `\n🔢 N° de commande : ${paymentInfo.orderNumber}`;
    }
    message += `\n🔢 Référence : ${paymentInfo.reference}\n`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        "[sendSubscriptionPaymentNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  async sendRefundNotification(paymentInfo) {
    const message = `
🔄 Remboursement PayPal effectué !

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
      console.error(
        "[sendRefundNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  async sendSentPaymentNotification(paymentInfo, imageBuffer = null) {
    try {
      // Générer l'image si elle n'est pas fournie
      if (!imageBuffer) {
        imageBuffer = await this.imageGenerator.generatePaymentImage(
          paymentInfo
        );
      }

      console.log(
        "[sendSentPaymentNotification@TelegramService]",
        `Taille de l'image : ${imageBuffer.length / 1024} KB`
      );

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
      console.error(
        "[sendSentPaymentNotification@TelegramService]",
        "Erreur lors de l'envoi de l'image Telegram:",
        error
      );
      // En cas d'erreur, on envoie au moins un message texte
      await this.sendFallbackMessage(paymentInfo);
    }
  }

  async sendFallbackMessage(paymentInfo) {
    let message = `
💸 Paiement PayPal envoyé !

👤 À : ${paymentInfo.recipient}
💵 Montant : *${paymentInfo.amount}*
📅 Date : ${paymentInfo.date}
🕒 Heure : ${paymentInfo.time}
🔢 Référence : ${paymentInfo.reference}`;

    if (paymentInfo.internalReference) {
      message += `
🔢 Référence interne : ${paymentInfo.internalReference}`;
    }

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "Markdown"
      });
    } catch (error) {
      console.error(
        "[sendFallbackMessage@TelegramService]",
        "Erreur lors de l'envoi du message de secours:",
        error
      );
    }
  }

  async sendBalanceUpdateNotification(previousBalance, newBalance) {
    const previous = parseFloat(previousBalance) || 0;
    const current = parseFloat(newBalance) || 0;
    const difference = current - previous;
    const formatAmount = (value) =>
      value.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const arrow = difference >= 0 ? "📈" : "📉";
    const sign = difference >= 0 ? "+" : "";

    const message = `
🏦 Solde PayPal mis à jour !

💰 Nouveau solde : <b>${formatAmount(current)} €</b>
${arrow} Variation : ${sign}${formatAmount(difference)} €
🔙 Ancien solde : ${formatAmount(previous)} €
`;

    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error(
        "[sendBalanceUpdateNotification@TelegramService]",
        "Erreur lors de l'envoi du message Telegram:",
        error
      );
    }
  }

  async sendMessage(message) {
    try {
      await this.bot.sendMessage(telegramConfig.chatId, message, {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error(
        "[sendErrorMessage@TelegramService]",
        "Erreur lors de l'envoi du message de secours:",
        error
      );
    }
  }
}
