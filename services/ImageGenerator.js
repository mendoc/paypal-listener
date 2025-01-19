import { createCanvas, loadImage } from "canvas";

export class ImageGenerator {
  async generatePaymentImage(paymentInfo) {
    const width = 720;
    const height = 850;

    // Créer un canvas avec les dimensions souhaitées (ratio carte bancaire)
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Définir le fond blanc
    ctx.fillStyle = "#dedee2";
    ctx.fillRect(0, 0, width, height);

    // Partie supérieure (carte blanche)
    await this.drawTopCard(ctx, paymentInfo);

    // Partie inférieure (fond bleu foncé)
    this.drawBottomCard(ctx, paymentInfo);

    // Retourner le buffer
    return canvas.toBuffer("image/png");
  }

  async drawTopCard(ctx, paymentInfo) {
    const width = 720;
    // Top line
    ctx.fillStyle = "#222d65";
    ctx.fillRect(0, 0, width, 13);

    // Zone blanche supérieure avec ombre
    ctx.beginPath();
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.roundRect(30, 32, width - 60, 300, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Charger et dessiner le logo
    try {
      const logo = await loadImage("./services/logo-round.png");
      const logoSize = 90; // Taille du logo
      ctx.drawImage(logo, 350 - logoSize / 2, 55, logoSize, logoSize);
    } catch (error) {
      console.error("Erreur lors du chargement du logo:", error);
      // Fallback au cas où l'image ne peut pas être chargée
      ctx.fillStyle = "#4A5724";
      ctx.beginPath();
      ctx.arc(400, 120, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Texte "Reçu de paiement"
    ctx.font = "bold 30px arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#24ae89"; // Couleur verte
    ctx.fillText("Transfert effectué", 355, 190);

    // Montant et destinataire
    ctx.font = "24px Verdana";
    ctx.textAlign = "center";
    ctx.fillStyle = "#222d65";
    ctx.fillText(
      `Le montant de ${paymentInfo.amount} a été envoyé à`,
      ctx.canvas.width / 2,
      240
    );
    ctx.fillText(
      `${paymentInfo.recipient.toUpperCase()}`,
      ctx.canvas.width / 2,
      275
    );
  }

  drawBottomCard(ctx, paymentInfo) {
    const width = 720;

    // Fond bleu marine
    ctx.fillStyle = "#222d65";
    ctx.beginPath();
    ctx.roundRect(30, 350, width - 60, ctx.canvas.height - 365, 10);
    ctx.fill();

    // Style pour les lignes d'information
    ctx.fillStyle = "#FFFFFF";
    const startY = 400;
    const lineHeight = 70;
    const labelX = 70;
    const valueX = 650;
    const recipient = this.splitName(paymentInfo.recipient.toUpperCase());
    // ;

    // Dessiner les lignes d'information
    this.drawInfoLine(
      ctx,
      "Référence",
      paymentInfo.reference,
      startY,
      labelX,
      valueX
    );
    this.drawInfoLine(
      ctx,
      "Montant",
      paymentInfo.amount,
      startY + lineHeight,
      labelX,
      valueX
    );
    this.drawInfoLine(
      ctx,
      "Date et Heure",
      `${paymentInfo.date} à ${paymentInfo.time.substring(0, 5)}`,
      startY + lineHeight * 2,
      labelX,
      valueX
    );
    this.drawInfoLine(
      ctx,
      "Bénéficiaire",
      recipient,
      startY + lineHeight * 3,
      labelX,
      valueX
    );

    // Ligne de séparation et texte du bas
    const footerY = 780;
    ctx.fillStyle = "#FFFFFF";
    const footerText = "Pour faire une transaction, rendez-vous sur :";
    ctx.font = "19px Verdana";
    ctx.textAlign = "center";
    ctx.fillText(footerText, ctx.canvas.width / 2, footerY);
    ctx.font = "bold 20px Courier New";
    ctx.fillText("bit.ly/miango", ctx.canvas.width / 2, footerY + 30);
  }

  drawInfoLine(ctx, label, value, y, labelX, valueX) {
    ctx.textAlign = "left";
    ctx.font = "24px Verdana";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(label, labelX, value.includes("\n") ? y + 15 : y);

    ctx.font = "bold 24px Verdana";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "right";
    if (value.includes("\n")) {
      const parts = value.split("\n");
      ctx.fillText(parts[0], ctx.canvas.width - 70, y);
      ctx.fillText(parts[1], ctx.canvas.width - 70, y + 30);
    } else {
      ctx.fillText(value, valueX, y);
    }

    // Ligne de séparation
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelX, value.includes("\n") ? y + 53 : y + 28);
    ctx.lineTo(valueX, value.includes("\n") ? y + 53 : y + 28);
    ctx.stroke();
  }

  splitName(str) {
    if (str.length <= 25) return str; // Si la chaîne est courte, pas besoin de la diviser.

    const parts = str.split(" ");
    const middle = Math.ceil(parts.length / 2); // Calcul du point médian en nombre de parts.

    const part1 = parts.slice(0, middle).join(" ");
    const part2 = parts.slice(middle).join(" ");

    return part1 + "\n" + part2;
  }
}
