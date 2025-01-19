const { createCanvas, loadImage } = require("canvas");

class ImageGenerator {
  async generatePaymentImage(paymentInfo) {
    // Créer un canvas avec les dimensions souhaitées (ratio carte bancaire)
    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext("2d");

    // Définir le fond blanc
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 800, 1000);

    // Partie supérieure (carte blanche)
    this.drawTopCard(ctx, paymentInfo);

    // Partie inférieure (fond bleu foncé)
    this.drawBottomCard(ctx, paymentInfo);

    // Retourner le buffer
    return canvas.toBuffer("image/png");
  }

  drawTopCard(ctx, paymentInfo) {
    // Zone blanche supérieure avec ombre
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    this.roundRect(ctx, 50, 50, 700, 300, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Logo Miango (cercle vert avec sourire)
    ctx.fillStyle = "#4A5724"; // Couleur vert olive foncé
    ctx.beginPath();
    ctx.arc(400, 120, 40, 0, Math.PI * 2);
    ctx.fill();

    // Sourire dans le logo
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(400, 120, 20, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // Texte "Reçu de paiement"
    ctx.fillStyle = "#1FB486"; // Couleur verte
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Reçu de paiement", 400, 200);

    // Montant et destinataire
    ctx.fillStyle = "#2D3748"; // Couleur texte foncée
    ctx.font = "24px Arial";
    ctx.fillText(
      `Vous avez envoyé ${paymentInfo.amount} à ${paymentInfo.recipient}`,
      400,
      250
    );

    // Numéro de référence
    ctx.fillStyle = "#A0AEC0"; // Couleur grise
    ctx.font = "18px Arial";
    ctx.fillText(`#${paymentInfo.reference}`, 400, 290);
  }

  drawBottomCard(ctx, paymentInfo) {
    // Fond bleu marine
    ctx.fillStyle = "#1A365D";
    this.roundRect(ctx, 50, 380, 700, 570, 20);
    ctx.fill();

    // Style pour les lignes d'information
    ctx.fillStyle = "#FFFFFF";
    const startY = 450;
    const lineHeight = 80;
    const labelX = 100;
    const valueX = 650;

    // Dessiner les lignes d'information
    this.drawInfoLine(
      ctx,
      "Envoyé par",
      paymentInfo.sender || "N/A",
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
      `${paymentInfo.date} à ${paymentInfo.time}`,
      startY + lineHeight * 2,
      labelX,
      valueX
    );
    this.drawInfoLine(
      ctx,
      "Bénéficiaire",
      paymentInfo.recipient,
      startY + lineHeight * 3,
      labelX,
      valueX
    );

    // Ligne de séparation et texte du bas
    const footerY = 880;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Pour faire une transaction, rendez-vous sur", 400, footerY);
    ctx.font = "bold 16px Arial";
    ctx.fillText("bit.ly/miango", 400, footerY + 30);
  }

  drawInfoLine(ctx, label, value, y, labelX, valueX) {
    ctx.textAlign = "left";
    ctx.font = "18px Arial";
    ctx.fillStyle = "#A0AEC0";
    ctx.fillText(label, labelX, y);

    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "right";
    ctx.fillText(value, valueX, y);

    // Ligne de séparation
    ctx.strokeStyle = "#2D4A8C";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelX, y + 20);
    ctx.lineTo(valueX, y + 20);
    ctx.stroke();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}

module.exports = ImageGenerator;
