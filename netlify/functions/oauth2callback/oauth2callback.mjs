import { OAuth2Service } from "../../../services/OAuth2";
import { DatabaseService } from "../../../services/database";

export default async (request, context) => {
  try {
    const oauth2Service = new OAuth2Service();
    const databaseService = new DatabaseService();

    const url = new URL(request.url)
    const code = url.searchParams.get('code') || 'World'

    const { tokens } = await oauth2Service.getToken(code);
    console.log("[/oauth2callback] Refresh Token:", tokens.refresh_token);

    await databaseService.updateToken(tokens.refresh_token);

    return new Response(
      "Token mis à jour avec succès ! Vous pouvez fermer cette fenêtre."
    );
  } catch (error) {
    console.error("[/oauth2callback] Erreur lors de l'obtention du token:", error);
    return new Response(error.toString(), {
      status: 500,
    });
  }
};

export const config = {
  path: "/oauth2callback",
};
