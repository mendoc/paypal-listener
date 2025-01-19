// getRefreshToken.js
const express = require('express');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const port = 3000;

const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://3000-mendoc-paypallistener-b71pv6z7yu8.ws-eu117.gitpod.io/oauth2callback'
);

// Générer l'URL d'autorisation
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    prompt: 'consent'  // Force à redemander le consentement pour obtenir un refresh token
});

app.get('/', (req, res) => {
    res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Refresh Token:', tokens.refresh_token);
        console.log('Access Token:', tokens.access_token);
        res.send('Token récupéré avec succès ! Vous pouvez fermer cette fenêtre.');
        
        // Arrêter le serveur après avoir obtenu le token
        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        console.error('Erreur lors de l\'obtention du token:', error);
        res.send('Erreur lors de la récupération du token');
    }
});

app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
    console.log('Veuillez vous rendre sur http://localhost:3000 pour commencer l\'autorisation');
});


/*
Refresh Token: 1//03penphUxiodXCgYIARAAGAMSNwF-L9IrWTI4NiwHRHMhkHUXjvfWm1An_HbHvOZJIm78Er5Nqb-_E_lCegKlhwNptk2hhKwelpQ
Access Token: ya29.a0ARW5m74mKoGXNdpITTvUcAd6wDC5JEPCVR3c40nMJ7DNI-xq-JwGxSU_HJWDsW-EWapP71PhAe9L4SvV47Antw4HHfb2FIyAbA67qlaBtd4hsRYvD1OM5euW9WWiXxRr6Ec3s2K1NwZauvOgXwIe2dYwN8LdUZaVKpNzbqEsaCgYKAbsSARESFQHGX2Mi6wQVrZ2LdGYCBY1njf1WMw0175

*/