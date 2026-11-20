import neo4j, { Driver, ManagedTransaction, Neo4jError, QueryResult, ServerInfo, Session } from "neo4j-driver";
import AppError from "../errors/app.error.js";
import DatabaseConnectionError from "../errors/databaseConnection.error.js";
import InternalServerError from "../errors/server.error.js";
import { env } from "../env.js";

export default class Neo4jDriver {
  public static instance: Driver;

  /**
   * Checks the health of the database connection and returns a ServerInfo object if healthy.
   * Throws a DatabaseConnectionError if the API returns an error.
   *
   * @returns {Promise<ServerInfo | undefined>} A promise that resolves to the server information if the connection is healthy, or undefined if the connection is unhealthy.
   * @throws {DatabaseConnectionError} If the database connection is unhealthy.
   */
  public static async checkDatabaseConnection(): Promise<ServerInfo | undefined> {
    try {
      const serverInfo: ServerInfo = await this.instance.getServerInfo();

      return serverInfo;
    } catch (err: unknown) {
      this.handleNeo4jError(err);
    }
  }

  /**
   * Initializes the driver by creating a connection to the Neo4j database.
   *
   * @return {Promise<Driver>} A promise that resolves to the Neo4j driver instance.
   */
  public static async createDatabaseConnection(): Promise<Driver> {
    try {
      this.instance = neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PW), {
        disableLosslessIntegers: true,
      });

      const serverInfo: ServerInfo | undefined = await this.checkDatabaseConnection();
      console.log(`Connection established: ${JSON.stringify(serverInfo)}`);
    } catch (err: unknown) {
      console.log(`Connection error\n${err}\nCause: ${err}`);
    }

    return this.instance;
  }

  /**
   * Handles Neo4j errors by throwing more specific errors.
   *
   * @returns {never} This function never returns, it always throws.
   * @throws {AppError} - An App Error (either the original or a subclass of it).
   */
  private static handleNeo4jError(err: unknown): never {
    // Fallback error throwing
    if (!(err instanceof Neo4jError)) {
      throw new InternalServerError("An error occurred while connecting to the database.");
    }

    // More errors could be added, but this is enough for now
    if (err.code === "ServiceUnavailable") {
      throw new DatabaseConnectionError("Unable to connect to the database.");
    } else {
      throw new InternalServerError("An error occurred while connecting to the database.");
    }
  }

  /**
   * Runs a query using the provided parameters and returns the result.
   *
   * @param {string} query The query to run.
   * @param {Record<string, unknown>} [params] The parameters to pass to the query.
   * @return {Promise<QueryResult>} A promise that resolves to the query result.
   */
  public static async runQuery(query: string, params?: Record<string, unknown>): Promise<QueryResult> {
    try {
      const session: Session = this.instance.session({
        database: env.DATABASE_NAME,
      });

      // TODO: This should ideally be split up in "exectuteWrite" and "executeRead"
      const result: QueryResult = await session.executeWrite((tx) => {
        return tx.run(query, params);
      });

      await session.close();

      return result;
    } catch (err: unknown) {
      return this.handleNeo4jError(err);
    }
  }

  /**
   * Runs work in one write transaction (the driver's `session.executeWrite`): commits if the work returns, rolls back if
   * it throws. The driver may retry the work on transient errors, so it must have no side effects outside the
   * transaction.
   *
   * @param {(tx: ManagedTransaction) => Promise<T>} work - The queries and checks to run in the transaction.
   * @return {Promise<T>} The result of the work.
   * @throws {AppError} The error the work threw (e.g. a `ValidationError`), or a database error.
   */
  public static async commitOrRollback<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session: Session = this.instance.session({ database: env.DATABASE_NAME });

    try {
      return await session.executeWrite(work);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }

      return this.handleNeo4jError(err);
    } finally {
      await session.close();
    }
  }
}
