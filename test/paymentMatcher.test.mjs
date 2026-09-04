import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PaymentMatcher, parseAmountToNumber } from "../services/paymentMatcher.js";

// Faux DatabaseService : enregistre les appels et rend les réponses configurées
function createFakeDb({ simulations = [], expediteur = null } = {}) {
  const calls = [];
  return {
    calls,
    async findEligibleSimulations(amount) {
      calls.push(["findEligibleSimulations", amount]);
      if (simulations instanceof Error) throw simulations;
      return simulations;
    },
    async findExpediteurByNom(nom) {
      calls.push(["findExpediteurByNom", nom]);
      return expediteur;
    },
    async createExpediteur(chatId, nom) {
      calls.push(["createExpediteur", chatId, nom]);
      return { uuid: "uuid-test", chat_id: chatId, nom };
    },
    async setSimulationExpediteurNom(reference, nom) {
      calls.push(["setSimulationExpediteurNom", reference, nom]);
      return 1;
    },
  };
}

const SIMULATION = {
  reference: "FRGA1234",
  whatsapp: "+33612345678",
  recu: "38,85",
  beneficiaire_num: "074213803",
  envoye: "25000",
};

describe("parseAmountToNumber", () => {
  test('convertit "38,85 € EUR" en 38.85', () => {
    assert.equal(parseAmountToNumber("38,85 € EUR"), 38.85);
  });

  test('convertit "0,00 € EUR" en 0', () => {
    assert.equal(parseAmountToNumber("0,00 € EUR"), 0);
  });

  test('convertit "1 234,56 € EUR" en 1234.56', () => {
    assert.equal(parseAmountToNumber("1 234,56 € EUR"), 1234.56);
  });

  test("retourne null pour undefined ou une chaîne inexploitable", () => {
    assert.equal(parseAmountToNumber(undefined), null);
    assert.equal(parseAmountToNumber(""), null);
    assert.equal(parseAmountToNumber("abc"), null);
  });
});

describe("PaymentMatcher.matchReceivedPayment", () => {
  test("Cas A : expéditeur connu + 1 simulation → enrichissement sans création", async () => {
    const db = createFakeDb({
      simulations: [SIMULATION],
      expediteur: { uuid: "uuid-1", chat_id: "+33612345678", nom: "Jean Dupont" },
    });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: 38.85 });

    assert.deepEqual(result, {
      matched: true,
      simulationReference: "FRGA1234",
      whatsapp: "+33612345678",
      beneficiaireNum: "074213803",
      envoye: "25000",
      expediteurCreated: false,
    });
    assert.ok(!db.calls.some(([name]) => name === "createExpediteur"));
    assert.deepEqual(
      db.calls.find(([name]) => name === "setSimulationExpediteurNom"),
      ["setSimulationExpediteurNom", "FRGA1234", "Jean Dupont"]
    );
  });

  test("Cas B : expéditeur inconnu + 1 simulation → création puis enrichissement", async () => {
    const db = createFakeDb({ simulations: [SIMULATION], expediteur: null });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: 38.85 });

    assert.deepEqual(result, {
      matched: true,
      simulationReference: "FRGA1234",
      whatsapp: "+33612345678",
      beneficiaireNum: "074213803",
      envoye: "25000",
      expediteurCreated: true,
    });
    assert.deepEqual(
      db.calls.find(([name]) => name === "createExpediteur"),
      ["createExpediteur", "+33612345678", "Jean Dupont"]
    );
    assert.deepEqual(
      db.calls.find(([name]) => name === "setSimulationExpediteurNom"),
      ["setSimulationExpediteurNom", "FRGA1234", "Jean Dupont"]
    );
  });

  test("le nom d'expéditeur est trimé avant écriture", async () => {
    const db = createFakeDb({ simulations: [SIMULATION], expediteur: null });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({ sender: "  Jean Dupont  ", amount: 38.85 });

    assert.equal(result.matched, true);
    assert.deepEqual(
      db.calls.find(([name]) => name === "createExpediteur"),
      ["createExpediteur", "+33612345678", "Jean Dupont"]
    );
  });

  test("Ambiguïté : plusieurs simulations → pas de match, aucune écriture", async () => {
    const db = createFakeDb({
      simulations: [SIMULATION, { reference: "FRGA5678", whatsapp: "+33699999999", recu: "38,85" }],
    });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: 38.85 });

    assert.deepEqual(result, { matched: false, reason: "ambiguous" });
    assert.deepEqual(db.calls, [["findEligibleSimulations", 38.85]]);
  });

  test("Aucune simulation → pas de match, aucune écriture", async () => {
    const db = createFakeDb({ simulations: [] });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: 38.85 });

    assert.deepEqual(result, { matched: false, reason: "no-simulation" });
    assert.deepEqual(db.calls, [["findEligibleSimulations", 38.85]]);
  });

  test("Frais présents → pas de rapprochement, aucun appel DB", async () => {
    const db = createFakeDb({ simulations: [SIMULATION], expediteur: null });
    const matcher = new PaymentMatcher(db);

    const result = await matcher.matchReceivedPayment({
      sender: "Jean Dupont",
      amount: 38.85,
      fees: 1.25,
    });

    assert.deepEqual(result, { matched: false, reason: "has-fees" });
    assert.deepEqual(db.calls, []);
  });

  test("Frais nuls ou absents → le rapprochement a bien lieu", async () => {
    for (const fees of [null, 0]) {
      const db = createFakeDb({ simulations: [SIMULATION], expediteur: null });
      const matcher = new PaymentMatcher(db);

      const result = await matcher.matchReceivedPayment({
        sender: "Jean Dupont",
        amount: 38.85,
        fees,
      });

      assert.equal(result.matched, true);
    }
  });

  test("Entrée invalide (sender vide ou montant null) → aucun appel DB", async () => {
    const db = createFakeDb();
    const matcher = new PaymentMatcher(db);

    assert.deepEqual(
      await matcher.matchReceivedPayment({ sender: undefined, amount: 38.85 }),
      { matched: false, reason: "invalid-input" }
    );
    assert.deepEqual(
      await matcher.matchReceivedPayment({ sender: "   ", amount: 38.85 }),
      { matched: false, reason: "invalid-input" }
    );
    assert.deepEqual(
      await matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: null }),
      { matched: false, reason: "invalid-input" }
    );
    assert.deepEqual(db.calls, []);
  });

  test("Erreur DB : l'erreur remonte à l'appelant", async () => {
    const db = createFakeDb({ simulations: new Error("connexion perdue") });
    const matcher = new PaymentMatcher(db);

    await assert.rejects(
      matcher.matchReceivedPayment({ sender: "Jean Dupont", amount: 38.85 }),
      /connexion perdue/
    );
  });
});
