import { google } from "googleapis";
import { gmail as gmailConfig } from "./config";

export class OAuth2Service {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      gmailConfig.clientId,
      gmailConfig.clientSecret,
      gmailConfig.redirectUri
    );
  }

  async getToken(code){
    return await this.oauth2Client.getToken(code);
  }

  getAuthUrl() {
    // Générer l'URL d'autorisation
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.modify"],
      prompt: "consent", // Force à redemander le consentement pour obtenir un refresh token
    });
  }
}
