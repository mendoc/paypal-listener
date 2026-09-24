import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseService } from "../services/database.js";

/** DatabaseService dont le pool PostgreSQL est remplacé par un faux qui enregistre les requêtes. */
function createService({ rowCount = 1, error = null } = {}) {
  const service = new DatabaseService();
  const calls = [];
  service.pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (error) throw error;
      return { rowCount };
    },
  };
  return { service, calls };
}

const WA_MESSAGE =
  "Nous avons reçu le PayPal. Nous procédons au transfert et nous vous enverrons une preuve du transfert.";

describe("DatabaseService.enqueueWhatsAppMessage", () => {
  it("met l'ordre dans la file du bot, avec sa clé d'idempotence", async () => {
    const { service, calls } = createService();

    const queued = await service.enqueueWhatsAppMessage("+33612345678", WA_MESSAGE, "paypal-recu:9AB12");

    assert.equal(queued, true);
    assert.match(calls[0].sql, /INSERT INTO bot\.outbox \(kind, payload, dedup_key\)/);
    assert.match(calls[0].sql, /ON CONFLICT \(dedup_key\) DO NOTHING/);
    assert.deepEqual(calls[0].params, [
      "send_message",
      JSON.stringify({ to: "+33612345678", message: WA_MESSAGE }),
      "paypal-recu:9AB12",
    ]);
  });

  it("accepte un ordre sans clé d'idempotence", async () => {
    const { service, calls } = createService();

    await service.enqueueWhatsAppMessage("241066123456", WA_MESSAGE);

    assert.equal(calls[0].params[2], null);
  });

  it("signale un ordre déjà en file", async () => {
    const { service } = createService({ rowCount: 0 });

    assert.equal(await service.enqueueWhatsAppMessage("241", WA_MESSAGE, "cle"), false);
  });

  it("propage une erreur de la base", async () => {
    const { service } = createService({ error: new Error("base injoignable") });

    await assert.rejects(service.enqueueWhatsAppMessage("241", WA_MESSAGE), /base injoignable/);
  });
});

describe("DatabaseService.enqueueScreenshot", () => {
  it("met la capture en file, une seule fois par simulation", async () => {
    const { service, calls } = createService();

    await service.enqueueScreenshot("FG2638DMKAS06", "192938655101164@lid");

    assert.deepEqual(calls[0].params, [
      "send_screenshot",
      JSON.stringify({ reference: "FG2638DMKAS06", to: "192938655101164@lid" }),
      "screenshot:FG2638DMKAS06",
    ]);
  });

  it("laisse le bot retrouver le destinataire quand il est inconnu", async () => {
    const { service, calls } = createService();

    await service.enqueueScreenshot("FG1", null);

    assert.equal(calls[0].params[1], JSON.stringify({ reference: "FG1", to: null }));
  });
});
