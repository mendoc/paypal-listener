import pkg from "pg";
const { Pool } = pkg;
import { database as dbConfig } from "./config";

export class DatabaseService {
  constructor() {
    // Configuration de la connexion
    this.pool = new Pool(dbConfig);
  }

  async getToken() {
    return await this.getConfig("token");
  }

  async getPayPalBalance() {
    return await this.getConfig("balancepp");
  }

  async updatePayPalBalance(amount) {
    return await this.updateConfig("balancepp", amount);
  }

  async updateToken(token) {
    return await this.updateConfig("token", token);
  }

  async updateConfig(name, value) {
    try {
      const query = "UPDATE config SET value = $2 WHERE name = $1";
      const values = [name, value];

      const result = await this.pool.query(query, values);
      console.log("[updateToken@DatabaseService] Mise à jour réussie");
      return result.rowCount;
    } catch (error) {
      console.error(
        "[updateToken@DatabaseService] Erreur lors de la mise à jour.",
        error
      );
      throw error;
    }
  }

  async getConfig(name) {
    try {
      const query = "SELECT value FROM config WHERE name = $1";
      const values = [name];

      const result = await this.pool.query(query, values);
      console.log(
        `[getConfig@DatabaseService] Récupération du parametre [${name}] réussie`
      );

      // Si aucune ligne n'est trouvée, retourne null
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].value;
    } catch (error) {
      console.error(
        `[getConfig@DatabaseService] Erreur lors de la récupération du parametre [${name}].`,
        error
      );
      throw error;
    }
  }

  async markSimulationAsProcessed(reference) {
    try {
      const query = "UPDATE simulations SET statut = 1, updated_at = NOW() WHERE reference = $1 AND statut = 0";
      const values = [reference];

      const result = await this.pool.query(query, values);
      if (result.rowCount === 1) {
        console.log(`[markSimulationAsProcessed@DatabaseService] Simulation ${reference} marquée comme traitée.`);
        return { success: true, message: "Transaction marquée comme traitée." };
      } else if (result.rowCount === 0) {
        console.log(`[markSimulationAsProcessed@DatabaseService] Transaction ${reference} non trouvée ou déjà traitée.`);
        return { success: false, message: "Transaction non trouvée ou déjà traitée." };
      } else {
        // Should not happen with a unique reference
        console.error(`[markSimulationAsProcessed@DatabaseService] Erreur inattendue: plusieurs transactions ${reference} mises à jour.`);
        return { success: false, message: "Erreur inattendue lors de la mise à jour." };
      }
    } catch (error) {
      console.error(
        `[markSimulationAsProcessed@DatabaseService] Erreur lors de la mise à jour de la simulation ${reference}.`,
        error
      );
      return { success: false, message: `Erreur lors de la mise à jour: ${error.message}` };
    }
  }

  async closeConnection() {
    try {
      await this.pool.end();
      console.log("[DatabaseService] Connexion à la base de données fermée");
    } catch (error) {
      console.error(
        "[DatabaseService] Erreur lors de la fermeture de la connexion",
        error
      );
      throw error;
    }
  }
}
