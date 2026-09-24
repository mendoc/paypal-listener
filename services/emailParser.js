const MONTHS = { Jan: "janvier", Feb: "février", Mar: "mars", Apr: "avril", May: "mai", Jun: "juin", Jul: "juillet", Aug: "août", Sep: "septembre", Oct: "octobre", Nov: "novembre", Dec: "décembre" };

function parseDateHeader(emailDate) {
  const m = emailDate.match(/\w+, (\d+) (\w+) (\d+) (\d{2}):(\d{2}):\d{2} ([-+]\d{4})/);
  if (!m) return {};
  const [, day, monthStr, year, hours, minutes] = m;
  const timezoneOffset = parseInt(m[6], 10) / 100;
  const adjustedHours = (Number(hours) + 1 - timezoneOffset + 24) % 24;
  return {
    date: `${Number(day)} ${MONTHS[monthStr] || monthStr} ${year}`,
    time: `${String(adjustedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

// Référence de simulation Miango, telle que produite par genererID() côté miango :
//   préfixe + année (2) + semaine ISO (2) + jour (A-G) + suffixe aléatoire (6)
// Le préfixe vaut GF dans le sens GAFR et FG dans le sens FRGA, les deux pouvant
// apparaître dans un mail PayPal. Le suffixe utilise l'alphabet ALPHABET_REFERENCE,
// un base32 sans I, L, O ni U pour éviter les confusions visuelles.
// La branche \d{4} couvre l'ancien suffixe à 4 chiffres, encore porté par les
// simulations créées avant le changement de format ; à retirer quand il n'en reste plus.
const INTERNAL_REFERENCE_PATTERN =
  />((?:FG|GF)\d{4}[A-G](?:[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}|\d{4}))</;

export function getEmailType(subject) {
  if (subject.includes("Vous avez reçu de l'argent")) {
    return "received";
  } else if (subject.includes("Vous avez envoyé un paiement")) {
    return "sent";
  } else if (subject.includes("Reçu pour votre paiement")) {
    return "subscription";
  } else if (subject.includes("Vous avez un remboursement")) {
    return "refund";
  }
  return null;
}

export function parsePayPalEmail(type, emailDate, emailContent) {
  if (type === "received") {
    return parseReceivedPaymentEmail(emailDate, emailContent);
  } else if (type === "sent") {
    return parseSentPaymentEmail(emailDate, emailContent);
  } else if (type === "subscription") {
    return parseSubscriptionPaymentEmail(emailDate, emailContent);
  } else if (type === "refund") {
    return parseRefundEmail(emailDate, emailContent);
  }
  return null;
}

function parseReceivedPaymentEmail(emailDate, emailContent) {
  const result = {
    type: "received",
  };

  const senderMatch = emailContent.match(/([\p{L}\p{M}]+\s+[\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)*)\s+vous a envoyé/u);
  if (senderMatch) result.sender = senderMatch[1];

  const feesMatch = emailContent.match(
    /Frais<\/strong><\/td>\s*<td[^>]*>([^<]+)/
  );
  if (feesMatch) {
    result.fees = feesMatch[1].trim();
    const totalMatch = emailContent.match(
      /Total<\/strong><\/td>\s*<td[^>]*>([^<]+)/
    );
    if (totalMatch) {
      result.amount = totalMatch[1].trim();
    }
  } else {
    const amountMatch = emailContent.match(
      /vous a envoyé\s([\d\s ,]+\s*€\s*EUR)/
    );
    if (amountMatch) result.amount = amountMatch[1];
  }

  const dateMatch = emailContent.match(
    /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
  );
  const fromHeader = parseDateHeader(emailDate);
  result.date = dateMatch ? dateMatch[1] : fromHeader.date;
  result.time = fromHeader.time;

  const referenceMatch = emailContent.match(
    /Numéro de transaction<\/strong><\/span><br \/><a.*?><span>(.*?)<\/span><\/a>/
  );
  if (referenceMatch) result.reference = referenceMatch[1];

  return result;
}

function parseSentPaymentEmail(emailDate, emailContent) {
  const result = {
    type: "sent",
  };

  const recipientMatch = emailContent.match(/envoyé .* à ([^.]+)\./);
  if (recipientMatch) result.recipient = recipientMatch[1].trim();

  const amountMatch = emailContent.match(
    /envoyé ([0-9\s ]+,[0-9]{2}\s*€?\s*EUR)/
  );
  if (amountMatch) {
    result.amount = amountMatch[1];
  } else {
    const paidMatch = emailContent.match(
      /Vous avez payé<\/strong><\/td>\s*<td[^>]*>([\d\s ]+,\d{2}\s*€\s*EUR)/
    );
    if (paidMatch) result.amount = paidMatch[1];
  }

  const dateMatch = emailContent.match(
    /Date de la transaction<\/strong><\/span><br \/><span>(.*?)<\/span>/
  );
  const fromHeader = parseDateHeader(emailDate);
  result.date = dateMatch ? dateMatch[1] : fromHeader.date;
  result.time = fromHeader.time;

  const referenceMatch = emailContent.match(
    /Numéro de transaction<\/strong><\/span><br \/><a.*?><span>(.*?)<\/span><\/a>/
  );
  if (referenceMatch) result.reference = referenceMatch[1];

  const internalReferenceMatch = emailContent.match(INTERNAL_REFERENCE_PATTERN);
  if (internalReferenceMatch) result.internalReference = internalReferenceMatch[1];

  return result;
}

function parseSubscriptionPaymentEmail(emailDate, emailContent) {
  const result = {
    type: "subscription",
  };

  const mainMatch = emailContent.match(
    /Vous avez payé ([\d\s ,]+\s*€\s*EUR) à ([^.<]+)/
  );
  if (mainMatch) {
    result.amount = mainMatch[1].trim();
    result.merchant = mainMatch[2].trim();
  }

  const orderMatch = emailContent.match(
    /(?:N° de commande|Numéro de facture)<\/(?:span|strong)><\/span>(?:<\/td>\s*<td[^>]*>|<br>)<span[^>]*><span>([^<]+)/
  );
  if (orderMatch) result.orderNumber = orderMatch[1].trim();

  const referenceMatch = emailContent.match(
    /details\/([A-Z0-9]+)\?/
  );
  if (referenceMatch) result.reference = referenceMatch[1];

  const { date, time } = parseDateHeader(emailDate);
  result.date = date;
  result.time = time;

  return result;
}

function parseRefundEmail(emailDate, emailContent) {
  const result = {
    type: "refund",
  };

  const mainMatch = emailContent.match(
    /remboursement de ([\d\s ,]+\s*€\s*EUR) (?:de la part de |de )(.+?)(?:\s*a \xe9t\xe9 initi\xe9|<\/span>)/
  );
  if (mainMatch) {
    result.amount = mainMatch[1].trim();
    result.sender = mainMatch[2].trim();
  }

  const referenceMatch = emailContent.match(
    /details\/([A-Z0-9]+)\?/
  );
  if (referenceMatch) result.reference = referenceMatch[1];

  const { date, time } = parseDateHeader(emailDate);
  result.date = date;
  result.time = time;

  return result;
}
