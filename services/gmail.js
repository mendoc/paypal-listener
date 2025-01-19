const { google } = require("googleapis");
const { gmail: gmailConfig } = require("./config");

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      gmailConfig.clientId,
      gmailConfig.clientSecret,
      gmailConfig.redirectUri
    );

    this.oauth2Client.setCredentials({
      refresh_token: gmailConfig.refreshToken,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  async checkNewPayPalEmails() {
    try {
      const response = await this.gmail.users.messages.list({
        userId: "me",
        q: "from:paypal.fr is:unread",
      });

      if (!response.data.messages) {
        return [];
      }

      const emails = [];
      for (const message of response.data.messages) {
        const emailData = await this.getEmailData(message.id);
        if (emailData) {
          const { content, date, subject } = emailData;
          const emailType = this.getEmailType(subject);

          if (emailType) {
            const parsedEmail = this.parsePayPalEmail(emailType, date, content);
            if (parsedEmail) {
                console.log("email:", parsedEmail)
              emails.push(parsedEmail);
            //   await this.markAsRead(message.id);
            }
          }
        }
      }

      return emails;
    } catch (error) {
      console.error("Erreur lors de la vérification des emails:", error);
      return [];
    }
  }

  getEmailType(subject) {
    if (subject.includes("Vous avez reçu de l'argent")) {
      return "received";
    } else if (subject.includes("Vous avez envoyé un paiement")) {
      return "sent";
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

      // Extraire le contenu du mail
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
      console.error("Erreur lors de la récupération de l'email:", error);
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
    }
    return null;
  }

  parseReceivedPaymentEmail(emailDate, emailContent) {
    const result = {
      type: "received",
    };

    // Extraction du nom de l'expéditeur
    const senderMatch = emailContent.match(/(\w+\s\w+)\s+vous a envoyé/);
    if (senderMatch) result.sender = senderMatch[1];

    // Extraction du montant
    const amountMatch = emailContent.match(/vous a envoyé\s([\d,]+\s€)/);
    if (amountMatch) result.amount = amountMatch[1];

    // Extraction de la date
    const dateMatch = emailContent.match(
      /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
    );
    if (dateMatch) result.date = dateMatch[1];

    // Extraction de l'heure en GMT+1
    const emailDateMatch = emailDate.match(
      /\w+, \d+ \w+ \d+ (\d{2}):(\d{2}):(\d{2}) ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [hours, minutes, seconds] = emailDateMatch.slice(1, 4).map(Number);
      const timezoneOffset = parseInt(emailDateMatch[4], 10) / 100;
      const adjustedHours = (hours + 1 - timezoneOffset + 24) % 24;
      result.time = `${adjustedHours
        .toString()
        .padStart(2, "0")}:${minutes}:${seconds} GMT+1`;
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

    // Extraction du montant
    const amountMatch = emailContent.match(
      /envoyé ([0-9]+,[0-9]{2}\s*€?\s*EUR)/
    );
    if (amountMatch) result.amount = amountMatch[1];

    // Extraction de la date
    const dateMatch = emailContent.match(
      /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
    );
    if (dateMatch) result.date = dateMatch[1];

    // Extraction de l'heure en GMT+1
    const emailDateMatch = emailDate.match(
      /\w+, \d+ \w+ \d+ (\d{2}):(\d{2}):(\d{2}) ([-+]\d{4})/
    );
    if (emailDateMatch) {
      const [hours, minutes, seconds] = emailDateMatch.slice(1, 4).map(Number);
      const timezoneOffset = parseInt(emailDateMatch[4], 10) / 100;
      const adjustedHours = (hours + 1 - timezoneOffset + 24) % 24;
      result.time = `${adjustedHours
        .toString()
        .padStart(2, "0")}:${minutes}:${seconds} GMT+1`;
    }

    // Extraction de la référence
    const referenceMatch = emailContent.match(
      /Numéro de transaction<\/strong><\/span><br \/><a.*?><span>(.*?)<\/span><\/a>/
    );
    if (referenceMatch) result.reference = referenceMatch[1];

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
      console.error("Erreur lors du marquage comme lu:", error);
    }
  }
}

module.exports = GmailService;
