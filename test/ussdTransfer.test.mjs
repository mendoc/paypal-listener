import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateVerifyToken, initiateUssdTransfer } from "../services/ussdTransfer.js";

// Faux services : enregistrent l'ordre des appels et rendent les réponses configurées.
function createServices({ storedToken = "TOKEN-EFFECTIF", created = true } = {}) {
  const calls = [];
  return {
    calls,
    databaseService: {
      async setSimulationVerifyToken(reference, token) {
        calls.push(["setSimulationVerifyToken", reference, token]);
        return storedToken;
      },
    },
    firestoreService: {
      async createUssdRequest(request) {
        calls.push(["createUssdRequest", request]);
        return created;
      },
    },
  };
}

const MATCH = { reference: "FRGA1234", beneficiaireNum: "074213803", envoye: "25000" };

describe("generateVerifyToken", () => {
  test("produit un jeton base64url d'au moins 32 octets", () => {
    const token = generateVerifyToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/, "doit être en base64url (ni +, ni /, ni =)");
    assert.equal(Buffer.from(token, "base64url").length, 32);
  });

  test("produit un jeton différent à chaque appel", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateVerifyToken()));
    assert.equal(tokens.size, 50);
  });
});

describe("initiateUssdTransfer", () => {
  test("pose le jeton en base AVANT de créer le document Firestore", async () => {
    const { calls, databaseService, firestoreService } = createServices();

    const result = await initiateUssdTransfer({ databaseService, firestoreService, match: MATCH });

    assert.deepEqual(result, {
      initiated: true,
      reference: "FRGA1234",
      phoneNumber: "074213803",
      amount: "25000",
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "setSimulationVerifyToken", "PostgreSQL doit être appelé en premier");
    assert.equal(calls[1][0], "createUssdRequest");
  });

  test("transmet à Firestore le jeton effectivement stocké, pas celui généré", async () => {
    const { calls, databaseService, firestoreService } = createServices({ storedToken: "JETON-DEJA-POSE" });

    await initiateUssdTransfer({ databaseService, firestoreService, match: MATCH });

    const [, generatedToken] = calls[0];
    const [, request] = calls[1];
    assert.notEqual(generatedToken, "JETON-DEJA-POSE", "un jeton neuf est bien proposé à la base");
    assert.equal(request.verifyToken, "JETON-DEJA-POSE", "mais c'est celui de la base qui part dans le document");
    assert.deepEqual(
      { reference: request.reference, phoneNumber: request.phoneNumber, amount: request.amount },
      { reference: "FRGA1234", phoneNumber: "074213803", amount: "25000" }
    );
  });

  test("simulation absente ou déjà traitée → aucune écriture Firestore", async () => {
    const { calls, databaseService, firestoreService } = createServices({ storedToken: null });

    const result = await initiateUssdTransfer({ databaseService, firestoreService, match: MATCH });

    assert.deepEqual(result, { initiated: false, reason: "not-pending" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "setSimulationVerifyToken");
  });

  test("document déjà existant → pas de transfert initié", async () => {
    const { databaseService, firestoreService } = createServices({ created: false });

    const result = await initiateUssdTransfer({ databaseService, firestoreService, match: MATCH });

    assert.deepEqual(result, { initiated: false, reason: "already-requested" });
  });

  test("les erreurs remontent à l'appelant", async () => {
    const databaseService = {
      async setSimulationVerifyToken() {
        throw new Error("connexion perdue");
      },
    };

    await assert.rejects(
      initiateUssdTransfer({ databaseService, firestoreService: {}, match: MATCH }),
      /connexion perdue/
    );
  });
});
