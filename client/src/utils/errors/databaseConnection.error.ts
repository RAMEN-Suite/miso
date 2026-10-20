import ApiError from "./api.error";

/**
 * Represents an error for database connection failures.
 *
 * Thrown when the application is unable to connect to the database during health check on app start.
 *
 * @extends {ApiError} - The base API error class.
 */
export default class DatabaseConnectionError extends ApiError {}
