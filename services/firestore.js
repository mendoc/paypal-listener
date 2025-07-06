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

    const eventDocRef = this.db.collection("events").doc("screenshot");

    const eventData = {
      time: FieldValue.serverTimestamp(), // Utilise le timestamp du serveur Firebase
      initiator: initiator || "unknown",
      reference: reference,
      to: to,
    };

    try {
      // Tente de mettre à jour le document. `update` échoue si le document n'existe pas.
      await eventDocRef.update(eventData);
      console.log(`[emitCaptureSaved@FirestoreService] L'événement pour la référence ${reference} a été mis à jour dans 'events/screenshot'.`);
    } catch (error) {
      // Si le document n'existe pas (code d'erreur 'NOT_FOUND'), on le crée.
      if (error.code === 5) { 
        console.log("[emitCaptureSaved@FirestoreService] Le document 'events/screenshot' n'existe pas. Création du document.");
        try {
          await eventDocRef.set(eventData);
          console.log(`[emitCaptureSaved@FirestoreService] Le document 'events/screenshot' a été créé pour la référence ${reference}.`);
        } catch (setError) {
          console.error("[emitCaptureSaved@FirestoreService] Erreur lors de la création du document 'events/screenshot'.", setError);
          throw setError;
        }
      } else {
        // Pour toute autre erreur, on la propage.
        console.error("[emitCaptureSaved@FirestoreService] Erreur lors de la mise à jour du document 'events/screenshot'.", error);
        throw error;
      }
    }
  }
}