// Rapprochement d'un paiement PayPal reçu avec une simulation FRGA en attente.
// Le DatabaseService est injecté pour rester testable sans connexion réelle.

// "38,85 € EUR" -> 38.85 ; null si la chaîne est inexploitable
export function parseAmountToNumber(amountStr) {
  if (!amountStr) {
    return null;
  }
  const normalized = String(amountStr)
    .replace(/[^\d,]/g, "")
    .replace(",", ".");
  const amount = parseFloat(normalized);
  return Number.isNaN(amount) ? null : amount;
}

// Raison d'un rapprochement impossible -> explication lisible dans Telegram.
// Toute nouvelle raison doit être ajoutée ici : un test vérifie que chacune a
// son libellé, pour qu'aucune ne remonte comme un code brut.
export const MATCH_FAILURE_LABELS = {
  "missing-sender": "Nom de l'expéditeur absent du mail PayPal",
  "unreadable-amount": "Montant du paiement illisible dans le mail PayPal",
  "has-fees":
    "Des frais ont été prélevés : le montant reçu ne peut pas correspondre au montant d'une simulation",
  "no-simulation":
    "Aucune simulation FRGA en attente des deux derniers jours ne correspond à ce montant",
  ambiguous:
    "Plusieurs simulations FRGA en attente correspondent à ce montant : le rapprochement serait arbitraire",
};

// Libellé de la raison, ou la raison elle-même si elle n'est pas répertoriée :
// mieux vaut un code brut dans la notification qu'une raison passée sous silence.
export function describeMatchFailure(reason) {
  return MATCH_FAILURE_LABELS[reason] || `Raison inconnue (${reason})`;
}

export class PaymentMatcher {
  constructor(databaseService) {
    this.db = databaseService;
  }

  /**
   * @param {{ sender: string|undefined, amount: number|null, fees?: number|null }} payment
   * @returns {Promise<
   *   | { matched: true, simulationReference: string, whatsapp: string,
   *       beneficiaireNum: string, envoye: string, expediteurCreated: boolean,
   *       expediteurUpdated: boolean }
   *   | { matched: false, reason: keyof typeof MATCH_FAILURE_LABELS }>}
   */
  async matchReceivedPayment({ sender, amount, fees = null }) {
    // Les deux entrées sont distinguées : la notification doit dire laquelle
    // manque, sinon il faut rouvrir le mail pour le savoir.
    if (!sender || !sender.trim()) {
      return { matched: false, reason: "missing-sender" };
    }
    if (amount == null) {
      return { matched: false, reason: "unreadable-amount" };
    }

    // Des frais prélevés faussent la correspondance avec le montant de la
    // simulation : on ne tente aucun rapprochement.
    if (fees != null && fees > 0) {
      return { matched: false, reason: "has-fees" };
    }

    const simulations = await this.db.findEligibleSimulations(amount);
    if (simulations.length === 0) {
      return { matched: false, reason: "no-simulation" };
    }
    if (simulations.length > 1) {
      return { matched: false, reason: "ambiguous" };
    }

    const simulation = simulations[0];
    const nom = sender.trim();

    // Cas B : expéditeur inconnu -> on l'enregistre avec le numéro de la simulation.
    // Sinon, la simulation rapprochée fait foi : si son numéro diffère du chat_id
    // enregistré, on réaligne ce dernier pour ne pas écrire à un numéro périmé.
    const expediteur = await this.db.findExpediteurByNom(nom);
    let expediteurCreated = false;
    let expediteurUpdated = false;
    if (!expediteur) {
      await this.db.createExpediteur(simulation.whatsapp, nom);
      expediteurCreated = true;
    } else if (simulation.whatsapp && expediteur.chat_id !== simulation.whatsapp) {
      await this.db.setExpediteurChatId(expediteur.uuid, simulation.whatsapp);
      expediteurUpdated = true;
    }

    await this.db.setSimulationExpediteurNom(simulation.reference, nom);

    return {
      matched: true,
      simulationReference: simulation.reference,
      whatsapp: simulation.whatsapp,
      beneficiaireNum: simulation.beneficiaire_num,
      envoye: simulation.envoye,
      expediteurCreated,
      expediteurUpdated,
    };
  }
}
