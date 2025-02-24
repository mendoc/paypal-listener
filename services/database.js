import pkg from "pg";
const { Pool } = pkg;
import { database as dbConfig } from "./config";

export class DatabaseService {
  constructor() {
    // Configuration de la connexion
    this.pool = new Pool(dbConfig);
  }

  async updateToken(token) {
    try {
      const query = "UPDATE config SET value = $1 WHERE name = 'token'";
      const values = [token];

      const result = await this.pool.query(query, values);
      console.log("[updateToken@DatabaseService] Mise à jour réussie");
      return result.rowCount;
    } catch (error) {
      console.error(
        "[updateToken@DatabaseService] Erreur lors de la mise à jour.",
        error
      );
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  async getToken() {
    try {
      const query = "SELECT value FROM config WHERE name = 'token'";

      const result = await this.pool.query(query);
      console.log("[getToken@DatabaseService] Récupération du token réussie");

      // Si aucune ligne n'est trouvée, retourne null
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].value;
    } catch (error) {
      console.error(
        "[getToken@DatabaseService] Erreur lors de la récupération du token.",
        error
      );
      throw error;
    } finally {
      await this.pool.end();
    }
  }
}
