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
   *   | { matched: false, reason: "invalid-input" | "has-fees" | "no-simulation" | "ambiguous" }>}
   */
  async matchReceivedPayment({ sender, amount, fees = null }) {
    if (!sender || !sender.trim() || amount == null) {
      return { matched: false, reason: "invalid-input" };
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
