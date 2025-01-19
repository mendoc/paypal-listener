const GmailService = require('./services/gmail');
const TelegramService = require('./services/telegram');

const gmailService = new GmailService();
const telegramService = new TelegramService();

async function checkPayPalPayments() {
    const emails = await gmailService.checkNewPayPalEmails();
    // return;
    for (const email of emails) {
        await telegramService.sendPayPalNotification(email);
    }
}

// Vérifier toutes les 5 minutes
//setInterval(checkPayPalPayments, 5 * 1 * 1000);

// Vérifier au démarrage
checkPayPalPayments();