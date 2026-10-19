import ApiError from "./api.error.js";

/**
 * Represents an error for external service failures (currently, when fetching guidelines fails).
 *
 * @extends {AppError} - The generic `AppError` class.
 */
export default class ExternalServiceError extends ApiError {}
