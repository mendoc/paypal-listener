import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Service pour interagir avec Firestore en utilisant le SDK Admin.
 * Il est conçu pour s'exécuter dans un environnement backend sécurisé comme Netlify Functions.
 *
 * Prérequis :
 * - La variable d'environnement `FIREBASE_SERVICE_ACCOUNT_JSON` doit être définie
 *   dans les paramètres du site Netlify et contenir le JSON du compte de service.
 */
export class FirestoreService {
  constructor() {
    // Assure que Firebase n'est initialisé qu'une seule fois (modèle singleton).
    if (!global._firebaseApp) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        initializeApp({
          credential: cert(serviceAccount),
        });
        global._firebaseApp = true; // Marqueur pour éviter la ré-initialisation
        console.log("[FirestoreService] Firebase Admin SDK initialisé avec succès.");
      } catch (error) {
        console.error("[FirestoreService] Erreur d'initialisation de Firebase Admin SDK.", error);
        console.error("[FirestoreService] Assurez-vous que la variable d'environnement FIREBASE_SERVICE_ACCOUNT_JSON est correctement définie.");
        throw new Error("Impossible d'initialiser Firestore. Vérifiez la configuration.");
      }
    }
    this.db = getFirestore();
  }

  /**
   * Écrit un événement dans un document de la collection 'events'.
   * Ajoute systématiquement le timestamp serveur et l'initiateur,
   * puis tente une mise à jour et crée le document s'il n'existe pas encore.
   * @param {string} eventName Le nom de la méthode émettrice (pour les logs).
   * @param {string} docId L'identifiant du document dans la collection 'events'.
   * @param {string} initiator La fonction ou le processus qui a déclenché l'événement.
   * @param {object} [extraData] Les champs supplémentaires propres à l'événement.
   */
  async _emitEvent(eventName, docId, initiator, extraData = {}) {
    const tag = `[${eventName}@FirestoreService]`;
    const docPath = `events/${docId}`;
    const eventDocRef = this.db.collection("events").doc(docId);

    const eventData = {
      time: FieldValue.serverTimestamp(),
      initiator: initiator || "unknown",
      ...extraData,
    };

    try {
      // Tente de mettre à jour le document. `update` échoue si le document n'existe pas.
      await eventDocRef.update(eventData);
      console.log(`${tag} L'événement a été mis à jour dans '${docPath}'.`);
    } catch (error) {
      // Si le document n'existe pas (code d'erreur 'NOT_FOUND'), on le crée.
      if (error.code === 5) {
        console.log(`${tag} Le document '${docPath}' n'existe pas. Création du document.`);
        try {
          await eventDocRef.set(eventData);
          console.log(`${tag} Le document '${docPath}' a été créé.`);
        } catch (setError) {
          console.error(`${tag} Erreur lors de la création du document '${docPath}'.`, setError);
          throw setError;
        }
      } else {
        // Pour toute autre erreur, on la propage.
        console.error(`${tag} Erreur lors de la mise à jour du document '${docPath}'.`, error);
        throw error;
      }
    }
  }

  /**
   * Met à jour le document 'events/screenshot' pour notifier qu'une capture a été enregistrée.
   * @param {string} initiator La fonction ou le processus qui a déclenché l'événement.
   * @param {string} reference La référence de la transaction.
   * @param {string} to Le numéro WhatsApp associé.
   */
  async emitCaptureSaved(initiator, reference, to) {
    if (!reference || !to) {
      console.error("[emitCaptureSaved@FirestoreService] Les paramètres 'reference' et 'to' sont requis.");
      return;
    }

    await this._emitEvent("emitCaptureSaved", "screenshot", initiator, { reference, to });
  }

  /**
   * Met à jour le document 'events/message' pour demander l'envoi d'un message WhatsApp.
   * @param {string} initiator La fonction ou le processus qui a déclenché l'événement.
   * @param {string} to Le numéro WhatsApp destinataire.
   * @param {string} message Le contenu du message à envoyer.
   */
  async emitSendWAMessage(initiator, to, message) {
    if (!to || !message) {
      console.error("[emitSendWAMessage@FirestoreService] Les paramètres 'to' et 'message' sont requis.");
      return;
    }

    await this._emitEvent("emitSendWAMessage", "message", initiator, { to, message });
  }

  /**
   * Met à jour le document 'events/refreshList' pour notifier qu'un rafraîchissement de la liste est demandé.
   * @param {string} initiator La fonction ou le processus qui a déclenché l'événement.
   */
  async emitRefreshList(initiator) {
    await this._emitEvent("emitRefreshList", "refreshList", initiator);
  }

  /**
   * Crée la demande de transfert USSD qui déclenche l'envoi Airtel Money.
   * L'identifiant du document est la référence de la simulation : `create` échoue
   * si le document existe déjà, ce qui évite d'initier deux fois le même transfert.
   * @param {{reference: string, phoneNumber: string, amount: string|number, verifyToken: string, type?: string}} params
   * @returns {Promise<boolean>} true si la demande a été créée, false si elle existait déjà.
   */
  async createUssdRequest({ reference, phoneNumber, amount, verifyToken, type = "sa" }) {
    const tag = "[createUssdRequest@FirestoreService]";

    if (!reference || !phoneNumber || !amount || !verifyToken) {
      console.error(
        `${tag} Les paramètres 'reference', 'phoneNumber', 'amount' et 'verifyToken' sont requis.`
      );
      return false;
    }

    const requestData = {
      action: "EXECUTE_USSD",
      phone_number: String(phoneNumber).replace(/\s/g, ""),
      amount: String(amount).replace(/\D/g, ""),
      reference,
      type,
      verify_token: verifyToken,
      time: FieldValue.serverTimestamp(),
    };

    try {
      await this.db.collection("ussd_requests").doc(reference).create(requestData);
      console.log(`${tag} Demande de transfert créée dans 'ussd_requests/${reference}'.`);
      return true;
    } catch (error) {
      // Code 6 = ALREADY_EXISTS : le transfert a déjà été initié pour cette simulation.
      if (error.code === 6) {
        console.log(`${tag} La demande 'ussd_requests/${reference}' existe déjà, transfert non ré-initié.`);
        return false;
      }
      console.error(`${tag} Erreur lors de la création de la demande 'ussd_requests/${reference}'.`, error);
      throw error;
    }
  }
}
