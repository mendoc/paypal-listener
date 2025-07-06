import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

export class ImageGenerator {
  async generatePaymentImage(paymentInfo) {
    if (paymentInfo && !paymentInfo.recipient) return null;
    
    try {
      const width = 720;
      const height = 850;
      const recipient = this.splitName((paymentInfo.recipient || '').toUpperCase());

      // Créer une image SVG avec le contenu
      const svgBuffer = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <!-- Fond gris clair -->
          <rect width="${width}" height="${height}" fill="#dedee2"/>

          <!-- Top line -->
          <rect x="0" y="0" width="${width}" height="13" fill="#222d65"/>

          <!-- Carte supérieure -->
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="shadow"/>
              <feOffset dx="0" dy="5" result="offsetblur"/>
              <feFlood flood-color="rgba(0,0,0,0.1)"/>
              <feComposite in2="offsetblur" operator="in"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <rect x="30" y="32" width="${width - 60}" height="300" rx="10" fill="#FFFFFF" filter="url(#shadow)"/>

          <!-- Textes supérieurs -->
          <text x="${width / 2}" y="190" font-family="Arial" font-size="30" font-weight="bold" fill="#24ae89" text-anchor="middle">Transfert effectué</text>
          <text x="${width / 2}" y="240" font-family="Verdana" font-size="24" fill="#222d65" text-anchor="middle">Le montant de ${paymentInfo.amount} a été envoyé à</text>
          <text x="${width / 2}" y="275" font-family="Verdana" font-size="24" fill="#222d65" text-anchor="middle">${paymentInfo.recipient.toUpperCase()}</text>
          <text x="${width / 2}" y="310" font-family="Verdana" font-size="24" fill="#cccccc" text-anchor="middle">${paymentInfo.internalReference ? paymentInfo.internalReference : ""}</text>

          <!-- Carte inférieure -->
          <rect x="30" y="350" width="${width - 60}" height="${height - 365}" rx="10" fill="#222d65"/>

          <!-- Informations -->
          ${this.generateInfoLine("Référence", paymentInfo.reference, 400)}
          ${this.generateInfoLine("Montant", paymentInfo.amount, 470)}
          ${this.generateInfoLine("Date et Heure", `${paymentInfo.date} à ${paymentInfo.time.substring(0, 5)}`, 540)}
          ${this.generateInfoLine("Bénéficiaire", recipient, 610)}

          <!-- Footer -->
          <text x="${width / 2}" y="780" font-family="Verdana" font-size="19" fill="#FFFFFF" text-anchor="middle">Pour faire une transaction, rendez-vous sur :</text>
          <text x="${width / 2}" y="810" font-family="Courier New" font-size="20" font-weight="bold" fill="#FFFFFF" text-anchor="middle">bit.ly/miango</text>
        </svg>
      `);

      try {
        // Lire le logo
        const logoPath = join(process.cwd(), './services/logo-round.png');
        const logo = readFileSync(logoPath);

        // Redimensionner le logo avant de le composer
        const resizedLogo = await sharp(logo)
          .resize(90, 90)
          .toBuffer();

        // Créer l'image finale avec le logo redimensionné
        const image = await sharp(svgBuffer)
          .composite([{
            input: resizedLogo,
            top: 55,
            left: 305,
          }])
          .png()
          .toBuffer();

        return image;
      } catch (error) {
        console.error('Erreur lors du chargement du logo:', error);
        // Retourner l'image sans logo en cas d'erreur
        return await sharp(svgBuffer).png().toBuffer();
      }
    } catch (error) {
      console.error('Erreur lors de la génération de l\'image:', error);
      throw error;
    }
  }

  generateInfoLine(label, value, y) {
    if (value.includes("\n")) {
      const [part1, part2] = value.split("\n");
      return `
        <g>
          <text x="70" y="${y + 15}" font-family="Verdana" font-size="24" fill="#FFFFFF">${label}</text>
          <text x="${720 - 70}" y="${y}" font-family="Verdana" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="end">${part1}</text>
          <text x="${720 - 70}" y="${y + 30}" font-family="Verdana" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="end">${part2}</text>
          <line x1="70" y1="${y + 53}" x2="${650}" y2="${y + 53}" stroke="#dddddd" stroke-width="1"/>
        </g>
      `;
    }

    return `
      <g>
        <text x="70" y="${y}" font-family="Verdana" font-size="24" fill="#FFFFFF">${label}</text>
        <text x="${650}" y="${y}" font-family="Verdana" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="end">${value}</text>
        <line x1="70" y1="${y + 28}" x2="${650}" y2="${y + 28}" stroke="#dddddd" stroke-width="1"/>
      </g>
    `;
  }

  splitName(str) {
    if (str.length <= 25) return str;

    const parts = str.split(" ");
    const middle = Math.ceil(parts.length / 2);

    const part1 = parts.slice(0, middle).join(" ");
    const part2 = parts.slice(middle).join(" ");

    return part1 + "\n" + part2;
  }
}