import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePayPalEmail } from "../services/emailParser.js";

const FIXTURE = readFileSync(
  new URL("./fixtures/paypal-sent-payment.html", import.meta.url),
  "utf8"
);
const EMAIL_DATE = "Thu, 24 Sep 2026 00:41:57 -0700";
const REFERENCE_FIXTURE = "GF2639DK4P7WX";

// Remplace la référence portée par la ligne « Votre message pour … ».
function withReference(reference) {
  return FIXTURE.replace(REFERENCE_FIXTURE, reference);
}

// Supprime entièrement la ligne « Votre message pour … ».
function withoutMessageRow() {
  return FIXTURE.replace(
    /<td width="45%">[\s\S]*?<\/td>\s*<td align="right" width="55%">[^<]*<\/td>/,
    ""
  );
}

function parseSent(html) {
  return parsePayPalEmail("sent", EMAIL_DATE, html);
}

describe("parsePayPalEmail — mail d'envoi", () => {
  test("extrait les champs du mail au-delà de la référence interne", () => {
    const result = parseSent(FIXTURE);

    assert.equal(result.type, "sent");
    assert.equal(result.recipient, "Aline Cherubine MBADINGA");
    assert.equal(result.amount, "38,11 € EUR");
    assert.equal(result.date, "24 septembre 2026");
    assert.equal(result.reference, "9AB12345CD6789012");
    assert.ok(result.time, "l'heure est déduite de l'en-tête Date");
  });
});

describe("parsePayPalEmail — référence de simulation", () => {
  test("nouveau format, sens GAFR (préfixe GF)", () => {
    assert.equal(parseSent(FIXTURE).internalReference, "GF2639DK4P7WX");
  });

  test("nouveau format, sens FRGA (préfixe FG)", () => {
    assert.equal(
      parseSent(withReference("FG2640AB3N5TQ")).internalReference,
      "FG2640AB3N5TQ"
    );
  });

  test("ancien format à 4 chiffres, dans les deux sens", () => {
    assert.equal(parseSent(withReference("GF2639D3349")).internalReference, "GF2639D3349");
    assert.equal(parseSent(withReference("FG2640A7412")).internalReference, "FG2640A7412");
  });

  test("accepte chaque lettre de jour, de A à G", () => {
    for (const jour of ["A", "B", "C", "D", "E", "F", "G"]) {
      const reference = `GF2639${jour}K4P7WX`;
      assert.equal(parseSent(withReference(reference)).internalReference, reference);
    }
  });

  test("accepte un suffixe composé uniquement de chiffres ou de lettres", () => {
    for (const reference of ["GF2639D123456", "GF2639DABCDEF"]) {
      assert.equal(parseSent(withReference(reference)).internalReference, reference);
    }
  });

  test("sans ligne de message, la référence interne est absente mais le reste est parsé", () => {
    const result = parseSent(withoutMessageRow());

    assert.equal(result.internalReference, undefined);
    assert.equal(result.reference, "9AB12345CD6789012");
    assert.equal(result.amount, "38,11 € EUR");
  });

  test("rejette les valeurs hors format", () => {
    const invalides = [
      "GF2639HK4P7WX", // lettre de jour hors A-G
      "GF2639DK4P7WI", // I, exclu de l'alphabet du suffixe
      "GF2639DK4P7WO", // O, exclu
      "GF2639DK4P7WL", // L, exclu
      "GF2639DK4P7WU", // U, exclu
      "GF2639DK4P7W", // suffixe trop court
      "GF2639DK4P7WXY", // suffixe trop long
      "XY2639DK4P7WX", // préfixe inconnu
      "GF263DK4P7WX", // partie date trop courte
    ];
    for (const reference of invalides) {
      assert.equal(
        parseSent(withReference(reference)).internalReference,
        undefined,
        `${reference} ne doit pas être reconnue`
      );
    }
  });
});

const FIXTURE_RECU = readFileSync(
  new URL("./fixtures/paypal-received-payment.html", import.meta.url),
  "utf8"
);
const EXPEDITEUR_FIXTURE = "Alain B. MOUKETOU";

// Remplace le nom de l'expéditeur dans la phrase « … vous a envoyé … ».
function avecExpediteur(nom) {
  return FIXTURE_RECU.replace(EXPEDITEUR_FIXTURE, nom);
}

function parseRecu(html) {
  return parsePayPalEmail("received", EMAIL_DATE, html);
}

describe("parsePayPalEmail — mail de réception", () => {
  test("extrait les champs du mail au-delà de l'expéditeur", () => {
    const result = parseRecu(FIXTURE_RECU);

    assert.equal(result.type, "received");
    assert.equal(result.amount, "54,88 € EUR");
    assert.equal(result.date, "28 septembre 2026");
    assert.equal(result.reference, "70910793MR795709J");
    assert.ok(result.time, "l'heure est déduite de l'en-tête Date");
  });
});

describe("parsePayPalEmail — nom de l'expéditeur", () => {
  test("initiale pointée, le cas qui échouait auparavant", () => {
    assert.equal(parseRecu(FIXTURE_RECU).sender, "Alain B. MOUKETOU");
  });

  test("accepte les noms ponctués, composés et accentués", () => {
    const noms = [
      "Jean Dupont",
      "Marie-Claire Ngoua",
      "N'Dong Obame",
      "Anne-Sophie D'Alessio",
      "Jean-Pierre O. NZE-BEKALE",
      "Émilie Moussavou",
      "Jean Pierre Marie Ndong",
    ];
    for (const nom of noms) {
      assert.equal(parseRecu(avecExpediteur(nom)).sender, nom, `${nom} doit être extrait`);
    }
  });

  test("accepte un nom d'un seul mot", () => {
    assert.equal(parseRecu(avecExpediteur("Ngoua")).sender, "Ngoua");
  });

  test("ne capture pas le balisage qui précède le nom", () => {
    const result = parseRecu(FIXTURE_RECU);

    assert.ok(!result.sender.includes("<"), "le nom ne doit contenir aucune balise");
    assert.ok(!result.sender.includes(">"), "le nom ne doit contenir aucune balise");
    assert.equal(result.sender, result.sender.trim(), "le nom ne doit pas être entouré d'espaces");
  });

  test("sans la phrase attendue, l'expéditeur reste absent", () => {
    const sansPhrase = FIXTURE_RECU.replace("vous a envoyé", "a reçu");

    assert.equal(parseRecu(sansPhrase).sender, undefined);
  });
});
