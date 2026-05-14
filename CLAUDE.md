# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes utiles

```bash
npm run dev        # Lancer le serveur de développement local (netlify dev)
npm run build      # Compiler les fonctions Netlify
npm run token      # Générer le refresh token OAuth2 initial (getRefreshToken.js)
```

Il n'y a pas de tests automatisés dans ce projet.

## Architecture

Ce projet est un écouteur de paiements PayPal déployé en tant que **fonctions Netlify serverless**. Il surveille une boîte Gmail pour détecter les emails PayPal non lus, puis envoie des notifications Telegram.

### Endpoints

- **`/checkpaypalpayments`** (`netlify/functions/checkpaypalpayments/checkpaypalpayments.mjs`) — Fonction principale. Récupère les emails PayPal non lus, les parse, notifie via Telegram, et met à jour la base de données. À appeler périodiquement (ex. cron externe).
- **`/oauth2callback`** (`netlify/functions/oauth2callback/oauth2callback.mjs`) — Reçoit le code OAuth2 de Google, échange contre un refresh token et le stocke en base.

### Couche services (`services/`)

| Fichier | Rôle |
|---|---|
| `config.js` | Lit les variables d'environnement et exporte les configs structurées |
| `gmail.js` | Intégration Gmail API : liste les messages, parse le HTML des emails |
| `OAuth2.js` | Génère l'URL d'auth et échange le code contre un token |
| `database.js` | PostgreSQL via `pg` : stocke le refresh token, le solde PayPal, et les simulations |
| `telegram.js` | Bot Telegram : envoie messages et images |
| `ImageGenerator.js` | Génère un reçu PNG (SVG + Sharp) pour les paiements envoyés |
| `firestore.js` | Firebase Admin : émet un événement dans `events/screenshot` quand une capture est sauvegardée |

### Flux de traitement des emails

`GmailService.checkNewPayPalEmails()` traite chaque email non lu selon 4 types, détectés par le sujet :

| Type | Sujet | Comportement |
|---|---|---|
| `received` | "Vous avez reçu de l'argent" | Notification Telegram texte |
| `sent` | "Vous avez envoyé un paiement" | Génération image + notification Telegram ; si référence interne `GFxxxx` présente, marque la simulation en base et émet un événement Firestore |
| `subscription` | "Reçu pour votre paiement" | Notification Telegram + enregistrement de la dépense via `https://miango.netlify.app/addexpense` (conversion EUR → FCFA : × 656) |
| `refund` | "Vous avez un remboursement" | Notification Telegram texte |

Après traitement, chaque email est marqué comme lu (`markAsRead`).

### Gestion du token OAuth2

Le refresh token Gmail est stocké en base (table `config`, clé `token`). Si Gmail retourne `invalid_grant`, la fonction envoie via Telegram un lien de ré-authentification pointant vers `/oauth2callback`.

### Base de données PostgreSQL

Table `config` : paires clé/valeur — `token` (refresh token Gmail) et `balancepp` (solde PayPal cumulé).  
Table `simulations` : suivi des transactions avec référence interne `GFxxxx`, colonne `whatsapp` (numéro destinataire), `statut` (0=en attente, 1=traité), `capture` (image base64).

### Variables d'environnement requises

```
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REDIRECT_URI

TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

DB_HOST
DB_USER
DB_PASSWORD
DB_NAME
DB_PORT

FIREBASE_SERVICE_ACCOUNT_JSON   # Optionnel — si absent, Firestore est désactivé
```

### Points d'attention

- `FirestoreService` n'est instancié que si `FIREBASE_SERVICE_ACCOUNT_JSON` est défini. Firebase est initialisé une seule fois via `global._firebaseApp` (singleton).
- `DatabaseService.closeConnection()` est toujours appelé dans le bloc `finally` de la fonction principale.
- Le logo `services/logo-round.png` est chargé depuis le disque par `ImageGenerator` avec `process.cwd()` comme base — le répertoire de travail doit être la racine du projet.
- Les fonctions Netlify utilisent ESM (`.mjs`) et importent les services en CommonJS (`.js`). Le `package.json` n'a pas `"type": "module"` donc les fichiers `.js` sont traités en CJS.
