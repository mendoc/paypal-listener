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
   * Tente une mise à jour, puis crée le document s'il n'existe pas encore.
   * @param {string} eventName Le nom de la méthode émettrice (pour les logs).
   * @param {string} docId L'identifiant du document dans la collection 'events'.
   * @param {object} eventData Les données de l'événement à écrire.
   */
  async _emitEvent(eventName, docId, eventData) {
    const tag = `[${eventName}@FirestoreService]`;
    const docPath = `events/${docId}`;
    const eventDocRef = this.db.collection("events").doc(docId);

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

    await this._emitEvent("emitCaptureSaved", "screenshot", {
      time: FieldValue.serverTimestamp(), // Utilise le timestamp du serveur Firebase
      initiator: initiator || "unknown",
      reference: reference,
      to: to,
    });
  }

  /**
   * Met à jour le document 'events/refreshList' pour notifier qu'un rafraîchissement de la liste est demandé.
   * @param {string} initiator La fonction ou le processus qui a déclenché l'événement.
   */
  async emitRefreshList(initiator) {
    await this._emitEvent("emitRefreshList", "refreshList", {
      time: FieldValue.serverTimestamp(),
      initiator: initiator || "unknown",
    });
  }
}