#!/usr/bin/env node
/**
 * Rejoue un fichier .eml comme si Mailgun envoyait le webhook.
 * Usage : node scripts/replay-eml.mjs <fichier.eml> [url]
 *
 * Par défaut l'URL cible est http://localhost:8888/handlepaypalpayments
 * La signature Mailgun est calculée avec MAILGUN_SIGNING_KEY depuis .env
 */

import { readFileSync } from "fs";
import { createHmac } from "crypto";
import { resolve } from "path";

// Charger .env manuellement
const envPath = resolve(process.cwd(), ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const emlPath = process.argv[2];
const targetUrl = process.argv[3] ?? "http://localhost:8888/handlepaypalpayments";

if (!emlPath) {
  console.error("Usage : node scripts/replay-eml.mjs <fichier.eml> [url]");
  process.exit(1);
}

const signingKey = env.MAILGUN_SIGNING_KEY;
if (!signingKey) {
  console.error("MAILGUN_SIGNING_KEY absent dans .env");
  process.exit(1);
}

// ─── Décodage QP UTF-8 ───────────────────────────────────────────────────────
function decodeQP(str) {
  str = str.replace(/=\r?\n/g, "");
  const bytes = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "=" && i + 2 < str.length) {
      bytes.push(parseInt(str.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}

function decodeEncodedWord(str) {
  return str.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, encoded) => {
    const normalized = encoded.replace(/_/g, " ");
    const bytes = [];
    let i = 0;
    while (i < normalized.length) {
      if (normalized[i] === "=" && i + 2 < normalized.length) {
        bytes.push(parseInt(normalized.slice(i + 1, i + 3), 16));
        i += 3;
      } else {
        bytes.push(normalized.charCodeAt(i));
        i++;
      }
    }
    return Buffer.from(bytes).toString("utf-8");
  });
}

// ─── Parse du .eml ──────────────────────────────────────────────────────────
const raw = readFileSync(emlPath, "latin1");
const headerEnd = raw.indexOf("\n\n");
const headersRaw = raw.slice(0, headerEnd);
const bodyRaw = raw.slice(headerEnd + 2);

function getHeader(name) {
  const re = new RegExp(`^${name}:\\s*(.+)`, "im");
  return headersRaw.match(re)?.[1]?.trim() ?? "";
}

const from = getHeader("From");
const senderMatch = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
const sender = senderMatch?.[1] ?? from;

const subject = decodeEncodedWord(getHeader("Subject"));
const date = getHeader("Date");
const messageId = getHeader("Message-ID") || getHeader("Message-Id");
const contentType = getHeader("Content-Type");
const recipient = getHeader("To");

// Déterminer si QP
const isQP = /quoted-printable/i.test(getHeader("Content-Transfer-Encoding"));
const bodyHtml = isQP ? decodeQP(bodyRaw) : bodyRaw;

// Construire message-headers (les plus importants)
const messageHeaders = JSON.stringify([
  ["Date", date],
  ["From", from],
  ["To", recipient],
  ["Subject", subject],
  ["Message-Id", messageId],
  ["Content-Type", contentType],
]);

// ─── Signature Mailgun ────────────────────────────────────────────────────────
const timestamp = String(Math.floor(Date.now() / 1000));
const token = createHmac("sha256", "random")
  .update(Math.random().toString())
  .digest("hex")
  .slice(0, 50);
const signature = createHmac("sha256", signingKey)
  .update(timestamp + token)
  .digest("hex");

// ─── Envoi multipart/form-data ───────────────────────────────────────────────
const boundary = "----MailgunReplayBoundary" + Date.now();

function field(name, value) {
  return (
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
    `${value}\r\n`
  );
}

const body =
  field("sender", sender) +
  field("recipient", recipient) +
  field("subject", subject) +
  field("body-html", bodyHtml) +
  field("body-plain", "") +
  field("Message-Id", messageId) +
  field("timestamp", timestamp) +
  field("token", token) +
  field("signature", signature) +
  field("message-headers", messageHeaders) +
  `--${boundary}--\r\n`;

console.log("Envoi vers :", targetUrl);
console.log("sender     :", sender);
console.log("subject    :", subject);
console.log("date       :", date);
console.log("messageId  :", messageId);
console.log("");

const res = await fetch(targetUrl, {
  method: "POST",
  headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body,
});

const text = await res.text();
console.log(`Réponse ${res.status} :`, text);
