require('dotenv').config();

module.exports = {
    gmail: {
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        redirectUri: process.env.GMAIL_REDIRECT_URI,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
    }
};