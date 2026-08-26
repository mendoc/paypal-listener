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
   * @param {{ sender: string|undefined, amount: number|null }} payment
   * @returns {Promise<
   *   | { matched: true, simulationReference: string, whatsapp: string, expediteurCreated: boolean }
   *   | { matched: false, reason: "invalid-input" | "no-simulation" | "ambiguous" }>}
   */
  async matchReceivedPayment({ sender, amount }) {
    if (!sender || !sender.trim() || amount == null) {
      return { matched: false, reason: "invalid-input" };
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

    // Cas B : expéditeur inconnu -> on l'enregistre avec le numéro de la simulation
    const expediteur = await this.db.findExpediteurByNom(nom);
    let expediteurCreated = false;
    if (!expediteur) {
      await this.db.createExpediteur(simulation.whatsapp, nom);
      expediteurCreated = true;
    }

    await this.db.setSimulationExpediteurNom(simulation.reference, nom);

    return {
      matched: true,
      simulationReference: simulation.reference,
      whatsapp: simulation.whatsapp,
      expediteurCreated,
    };
  }
}
