import { google } from "googleapis";
import { gmail as gmailConfig } from "./config.js";

export class GmailService {
  constructor(refreshToken) {
    this.oauth2Client = new google.auth.OAuth2(
      gmailConfig.clientId,
      gmailConfig.clientSecret,
      gmailConfig.redirectUri
    );

    this.refreshToken = refreshToken;

    this.oauth2Client.setCredentials({
      refresh_token: this.refreshToken,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  async checkNewPayPalEmails() {
    let emails = [];
    try {
      const response = await this.gmail.users.messages.list({
        userId: "me",
        q: "from:paypal.fr is:unread",
      });

      if (!response.data.messages) {
        return { emails };
      }

      let amountSum = 0;
      for (const message of response.data.messages) {
        const emailData = await this.getEmailData(message.id);
        if (emailData) {
          const { content, date, subject } = emailData;
          const emailType = this.getEmailType(subject);

          if (emailType) {
            const parsedEmail = this.parsePayPalEmail(emailType, date, content);
            if (parsedEmail) {
              const currentAmount = parseFloat(
                parsedEmail.amount?.replace(/[^\d,]/g, "").replace(",", ".")
              ) || 0;
              amountSum += currentAmount * (emailType === "received" ? 1 : -1);
              console.log(
                "[checkNewPayPalEmails@GmailService]",
                "email:",
                parsedEmail
              );
              emails.push(parsedEmail);
              await this.markAsRead(message.id);
            }
          }
        }
      }

      amountSum = amountSum.toFixed(2);

      return { emails, amountSum };
    } catch (error) {
      let errorCode = 0;
      let errorMsg = "";
      if (error.toString().includes("invalid_grant")) {
        errorCode = 1;
        errorMsg = "Token expiré";
      } else {
        errorCode = 2;
        errorMsg = `Erreur lors de la vérification des emails: ${errorMsg.toString()}`;
      }
      console.error("[checkNewPayPalEmails@GmailService]", errorMsg);
      return { error: true, errorCode };
    }
  }

  getEmailType(subject) {
    if (subject.includes("Vous avez reçu de l'argent")) {
      return "received";
    } else if (subject.includes("Vous avez envoyé un paiement")) {
      return "sent";
    } else if (subject.includes("Reçu pour votre paiement")) {
      return "subscription";
    } else if (subject.includes("Vous avez un remboursement")) {
      return "refund";
    }
    return null;
  }

  async getEmailData(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const headers = response.data.payload.headers;
      const subject = headers.find((h) => h.name === "Subject").value;
      const date = headers.find((h) => h.name === "Date").value;

      let content = "";
      if (response.data.payload.parts) {
        content = this.getTextFromParts(response.data.payload.parts);
      } else if (response.data.payload.body.data) {
        content = Buffer.from(
          response.data.payload.body.data,
          "base64"
        ).toString();
      }

      return { content, date, subject };
    } catch (error) {
      console.error(
        "[getEmailData@GmailService]",
        "Erreur lors de la récupération de l'email:",
        error
      );
      return null;
    }
  }

  getTextFromParts(parts) {
    let text = "";
    for (const part of parts) {
      if (part.mimeType === "text/plain" || part.mimeType === "text/html") {
        if (part.body.data) {
          const decoded = Buffer.from(part.body.data, "base64").toString();
          text += decoded
            .replace(/=\r?\n/g, "")
            .replace(/=([0-9A-F]{2})/g, (_, p1) =>
              String.fromCharCode(parseInt(p1, 16))
            );
        }
      }
      if (part.parts) {
        text += this.getTextFromParts(part.parts);
      }
    }
    return text;
  }

  parsePayPalEmail(type, emailDate, emailContent) {
    if (type === "received") {
      return this.parseReceivedPaymentEmail(emailDate, emailContent);
    } else if (type === "sent") {
      return this.parseSentPaymentEmail(emailDate, emailContent);
    } else if (type === "subscription") {
      return this.parseSubscriptionPaymentEmail(emailDate, emailContent);
    } else if (type === "refund") {
      return this.parseRefundEmail(emailDate, emailContent);
    }
    return null;
  }

  parseReceivedPaymentEmail(emailDate, emailContent) {
    const result = {
      type: "received",
    };

    // Extraction du nom de l'expéditeur
    const senderMatch = emailContent.match(/([\p{L}\p{M}]+\s+[\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)*)\s+vous a envoyé/u);
    if (senderMatch) result.sender = senderMatch[1];

    // Extraction des frais
    const feesMatch = emailContent.match(
      /Frais<\/strong><\/td>\s*<td[^>]*>([^<]+)/
    );
    if (feesMatch) {
      result.fees = feesMatch[1].trim();
      // Si il y a des frais, on cherche le total qui sera le vrai montant reçu
      const totalMatch = emailContent.match(
        /Total<\/strong><\/td>\s*<td[^>]*>([^<]+)/
      );
      if (totalMatch) {
        result.amount = totalMatch[1].trim();
      }
    } else {
      // Pas de frais, on extrait le montant directement
      const amountMatch = emailContent.match(
        /vous a envoyé\s([\d\s\u00a0,]+\s*€\s*EUR)/
      );
      if (amountMatch) result.amount = amountMatch[1];
    }

    // Extraction de la date
    const dateMatch = emailContent.match(
      /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
    );
    if (dateMatch) result.date = dateMatch[1];

    // Extraction de l'heure avec formatage
    const emailDateMatch = emailDate.match(
      /\w+, \d+ \w+ \d+ (\d{2}):(\d{2}):\d{2} ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [hours, minutes] = emailDateMatch.slice(1, 3).map(Number);
      const timezoneOffset = parseInt(emailDateMatch[3], 10) / 100;
      const adjustedHours = (hours + 1 - timezoneOffset + 24) % 24;
      result.time = `${String(adjustedHours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}`;
    }

    // Extraction de la référence
    const referenceMatch = emailContent.match(
      /Numéro de transaction<\/strong><\/span><br \/><a.*?><span>(.*?)<\/span><\/a>/
    );
    if (referenceMatch) result.reference = referenceMatch[1];

    return result;
  }

  parseSentPaymentEmail(emailDate, emailContent) {
    const result = {
      type: "sent",
    };

    // Extraction du destinataire
    const recipientMatch = emailContent.match(/envoyé .* à ([^.]+)\./);
    if (recipientMatch) result.recipient = recipientMatch[1].trim();

    // Extraction du montant (EUR direct ou équivalent EUR pour devises étrangères)
    const amountMatch = emailContent.match(
      /envoyé ([0-9\s\u00a0]+,[0-9]{2}\s*€?\s*EUR)/
    );
    if (amountMatch) {
      result.amount = amountMatch[1];
    } else {
      const eurEquivalentMatch = emailContent.match(
        /=\s*([\d\s\u00a0]+,\d{2}\s*€\s*EUR)/
      );
      if (eurEquivalentMatch) result.amount = eurEquivalentMatch[1];
    }

    // Extraction de la date
    const dateMatch = emailContent.match(
      /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
    );
    if (dateMatch) result.date = dateMatch[1];

    // Extraction de l'heure avec formatage
    const emailDateMatch = emailDate.match(
      /\w+, \d+ \w+ \d+ (\d{2}):(\d{2}):\d{2} ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [hours, minutes] = emailDateMatch.slice(1, 3).map(Number);
      const timezoneOffset = parseInt(emailDateMatch[3], 10) / 100;
      const adjustedHours = (hours + 1 - timezoneOffset + 24) % 24;
      result.time = `${String(adjustedHours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}`;
    }

    // Extraction de la référence
    const referenceMatch = emailContent.match(
      /Numéro de transaction<\/strong><\/span><br \/><a.*?><span>(.*?)<\/span><\/a>/
    );
    if (referenceMatch) result.reference = referenceMatch[1];

    const internalReferenceMatch = emailContent.match(/>(GF\d{4}[A-Z]\d{4})</);
    if (internalReferenceMatch) result.internalReference = internalReferenceMatch[1];

    return result;
  }

  parseSubscriptionPaymentEmail(emailDate, emailContent) {
    const result = {
      type: "subscription",
    };

    // Extraction du marchand et du montant depuis "Vous avez payé XX,XX € EUR à Marchand."
    const mainMatch = emailContent.match(
      /Vous avez payé ([\d\s\u00a0,]+\s*€\s*EUR) à ([^.<]+)/
    );
    if (mainMatch) {
      result.amount = mainMatch[1].trim();
      result.merchant = mainMatch[2].trim();
    }

    // Extraction du n° de commande ou numéro de facture
    const orderMatch = emailContent.match(
      /(?:N° de commande|Numéro de facture)<\/(?:span|strong)><\/span>(?:<\/td>\s*<td[^>]*>|<br>)<span[^>]*><span>([^<]+)/
    );
    if (orderMatch) result.orderNumber = orderMatch[1].trim();

    // Extraction de la référence de transaction depuis l'URL
    const referenceMatch = emailContent.match(
      /details\/([A-Z0-9]+)\?/
    );
    if (referenceMatch) result.reference = referenceMatch[1];

    // Extraction de la date et de l'heure depuis le header de l'email
    const emailDateMatch = emailDate.match(
      /\w+, (\d+) (\w+) (\d+) (\d{2}):(\d{2}):\d{2} ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [, day, monthStr, year, hours, minutes] = emailDateMatch;
      const timezoneOffset = parseInt(emailDateMatch[6], 10) / 100;
      const adjustedHours = (Number(hours) + 1 - timezoneOffset + 24) % 24;
      const months = { Jan: "janvier", Feb: "février", Mar: "mars", Apr: "avril", May: "mai", Jun: "juin", Jul: "juillet", Aug: "août", Sep: "septembre", Oct: "octobre", Nov: "novembre", Dec: "décembre" };
      const month = months[monthStr] || monthStr;
      result.date = `${Number(day)} ${month} ${year}`;
      result.time = `${String(adjustedHours).padStart(2, "0")}:${minutes}`;
    }

    return result;
  }

  parseRefundEmail(emailDate, emailContent) {
    const result = {
      type: "refund",
    };

    // Extraction du montant et de l'expéditeur depuis le titre principal
    // Format 1: "remboursement de XX € EUR de la part de Nom a été initié"
    // Format 2: "remboursement de XX € EUR de Nom</span>"
    const mainMatch = emailContent.match(
      /remboursement de ([\d\s\u00a0,]+\s*€\s*EUR) (?:de la part de |de )(.+?)(?:\s*a \xe9t\xe9 initi\xe9|<\/span>)/
    );
    if (mainMatch) {
      result.amount = mainMatch[1].trim();
      result.sender = mainMatch[2].trim();
    }

    // Extraction de la référence de transaction depuis l'URL
    const referenceMatch = emailContent.match(
      /details\/([A-Z0-9]+)\?/
    );
    if (referenceMatch) result.reference = referenceMatch[1];

    // Extraction de la date et de l'heure depuis le header de l'email
    const emailDateMatch = emailDate.match(
      /\w+, (\d+) (\w+) (\d+) (\d{2}):(\d{2}):\d{2} ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [, day, monthStr, year, hours, minutes] = emailDateMatch;
      const timezoneOffset = parseInt(emailDateMatch[6], 10) / 100;
      const adjustedHours = (Number(hours) + 1 - timezoneOffset + 24) % 24;
      const months = { Jan: "janvier", Feb: "février", Mar: "mars", Apr: "avril", May: "mai", Jun: "juin", Jul: "juillet", Aug: "août", Sep: "septembre", Oct: "octobre", Nov: "novembre", Dec: "décembre" };
      const month = months[monthStr] || monthStr;
      result.date = `${Number(day)} ${month} ${year}`;
      result.time = `${String(adjustedHours).padStart(2, "0")}:${minutes}`;
    }

    return result;
  }

  async markAsRead(messageId) {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    } catch (error) {
      console.error(
        "[markAsRead@GmailService]",
        "Erreur lors du marquage comme lu:",
        error
      );
    }
  }
}
