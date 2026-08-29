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
