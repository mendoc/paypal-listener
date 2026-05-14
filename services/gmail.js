import { google } from "googleapis";
import { gmail as gmailConfig } from "./config.js";
import { getEmailType, parsePayPalEmail } from "./emailParser.js";

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
          const emailType = getEmailType(subject);

          if (emailType) {
            const parsedEmail = parsePayPalEmail(emailType, date, content);
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
