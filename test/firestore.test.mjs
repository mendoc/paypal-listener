import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FirestoreService } from "../services/firestore.js";

// Instancie le service sans passer par le constructeur (qui initialise Firebase)
// et branche un faux Firestore qui enregistre les appels.
function createService({ createError = null } = {}) {
  const calls = [];
  const service = Object.create(FirestoreService.prototype);
  service.db = {
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(id) {
          calls.push(["doc", id]);
          return {
            async create(data) {
              calls.push(["create", data]);
              if (createError) throw createError;
            },
          };
        },
      };
    },
  };
  return { service, calls };
}

const TRANSFER = { reference: "FRGA1234", phoneNumber: "074213803", amount: "25000" };

describe("FirestoreService.createUssdRequest", () => {
  test("crée le document avec les champs attendus par l'app USSD", async () => {
    const { service, calls } = createService();

    const created = await service.createUssdRequest(TRANSFER);

    assert.equal(created, true);
    assert.deepEqual(calls[0], ["collection", "ussd_requests"]);
    assert.deepEqual(calls[1], ["doc", "FRGA1234"]);

    const [, data] = calls[2];
    assert.equal(data.action, "EXECUTE_USSD");
    assert.equal(data.phone_number, "074213803");
    assert.equal(data.amount, "25000");
    assert.equal(data.reference, "FRGA1234");
    assert.equal(data.type, "sa");
    assert.ok(data.time, "le champ time doit être renseigné");
    assert.deepEqual(Object.keys(data).sort(), [
      "action",
      "amount",
      "phone_number",
      "reference",
      "time",
      "type",
    ]);
  });

  test("normalise le montant et le numéro, et accepte un type explicite", async () => {
    const { service, calls } = createService();

    await service.createUssdRequest({
      reference: "FRGA5678",
      phoneNumber: "074 21 38 03",
      amount: "25 000 F CFA",
      type: "am",
    });

    const [, data] = calls[2];
    assert.equal(data.phone_number, "074213803");
    assert.equal(data.amount, "25000");
    assert.equal(data.type, "am");
  });

  test("les montants numériques sont convertis en chaîne", async () => {
    const { service, calls } = createService();

    await service.createUssdRequest({ ...TRANSFER, amount: 25000 });

    const [, data] = calls[2];
    assert.equal(data.amount, "25000");
    assert.equal(typeof data.amount, "string");
  });

  test("retourne false sans écrire si un paramètre est manquant", async () => {
    for (const params of [
      { ...TRANSFER, reference: "" },
      { ...TRANSFER, phoneNumber: undefined },
      { ...TRANSFER, amount: null },
    ]) {
      const { service, calls } = createService();
      assert.equal(await service.createUssdRequest(params), false);
      assert.deepEqual(calls, []);
    }
  });

  test("retourne false si la demande existe déjà (pas de double transfert)", async () => {
    const alreadyExists = Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
    const { service } = createService({ createError: alreadyExists });

    assert.equal(await service.createUssdRequest(TRANSFER), false);
  });

  test("propage les autres erreurs Firestore", async () => {
    const boom = Object.assign(new Error("indisponible"), { code: 14 });
    const { service } = createService({ createError: boom });

    await assert.rejects(service.createUssdRequest(TRANSFER), /indisponible/);
  });
});

// Faux Firestore pour les événements : `_emitEvent` tente un update puis crée
// le document s'il n'existe pas (erreur de code 5).
function createEventService({ docExists = true } = {}) {
  const calls = [];
  const service = Object.create(FirestoreService.prototype);
  service.db = {
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(id) {
          calls.push(["doc", id]);
          return {
            async update(data) {
              calls.push(["update", data]);
              if (!docExists) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
            },
            async set(data) {
              calls.push(["set", data]);
            },
          };
        },
      };
    },
  };
  return { service, calls };
}

const WA_MESSAGE =
  "Nous avons reçu le PayPal. Nous procédons au transfert et nous vous enverrons une preuve du transfert.";

describe("FirestoreService.emitSendWAMessage", () => {
  test("écrit dans events/message avec l'initiateur, le numéro et le message", async () => {
    const { service, calls } = createEventService();

    await service.emitSendWAMessage("function-handlepaypalpayments", "+33612345678", WA_MESSAGE);

    assert.deepEqual(calls[0], ["collection", "events"]);
    assert.deepEqual(calls[1], ["doc", "message"]);

    const [, data] = calls[2];
    assert.equal(data.initiator, "function-handlepaypalpayments");
    assert.equal(data.to, "+33612345678");
    assert.equal(data.message, WA_MESSAGE);
    assert.ok(data.time, "le champ time doit être renseigné");
    assert.deepEqual(Object.keys(data).sort(), ["initiator", "message", "time", "to"]);
  });

  test("crée le document s'il n'existe pas encore", async () => {
    const { service, calls } = createEventService({ docExists: false });

    await service.emitSendWAMessage("function-checkpaypalpayments", "+241066123456", WA_MESSAGE);

    const [op, data] = calls[calls.length - 1];
    assert.equal(op, "set");
    assert.equal(data.to, "+241066123456");
    assert.equal(data.message, WA_MESSAGE);
  });

  test("n'écrit rien si le numéro ou le message est manquant", async () => {
    for (const args of [
      ["function-handlepaypalpayments", "", WA_MESSAGE],
      ["function-handlepaypalpayments", "+33612345678", ""],
    ]) {
      const { service, calls } = createEventService();
      await service.emitSendWAMessage(...args);
      assert.deepEqual(calls, []);
    }
  });
});
