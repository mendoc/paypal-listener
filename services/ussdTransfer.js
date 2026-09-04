// Préparation de la demande de transfert USSD.
//
// Le contrat de l'app USSor impose un ordre strict : la simulation doit porter
// le verify_token en base AVANT que le document Firestore n'existe, sinon la
// vérification que l'app effectue juste avant de composer échoue et le transfert
// expire. Cette logique est centralisée ici pour que les deux handlers ne
// puissent pas diverger.

import { randomBytes } from "crypto";

// Jeton opaque relayé par l'app à la vérification (32 octets, base64url).
export function generateVerifyToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * @param {{
 *   databaseService: { setSimulationVerifyToken: Function },
 *   firestoreService: { createUssdRequest: Function },
 *   match: { reference: string, beneficiaireNum: string, envoye: string },
 * }} params
 * @returns {Promise<
 *   | { initiated: true, reference: string, phoneNumber: string, amount: string }
 *   | { initiated: false, reason: "not-pending" | "already-requested" }>}
 */
export async function initiateUssdTransfer({ databaseService, firestoreService, match }) {
  const reference = match.reference;

  // 1) PostgreSQL d'abord. Retourne null si la simulation n'est plus à traiter.
  const verifyToken = await databaseService.setSimulationVerifyToken(
    reference,
    generateVerifyToken()
  );
  if (!verifyToken) {
    return { initiated: false, reason: "not-pending" };
  }

  // 2) Firestore ensuite, avec le jeton effectivement stocké.
  const created = await firestoreService.createUssdRequest({
    reference,
    phoneNumber: match.beneficiaireNum,
    amount: match.envoye,
    verifyToken,
  });
  if (!created) {
    return { initiated: false, reason: "already-requested" };
  }

  return {
    initiated: true,
    reference,
    phoneNumber: match.beneficiaireNum,
    amount: match.envoye,
  };
}
