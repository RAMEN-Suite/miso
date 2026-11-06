import AppError from "./app.error";

/**
 * Represents an error for a config that does not have the expected format or whose model is invalid, e.g. a missing
 * block, a wrong value or an unknown key. The message lists every problem with its path in the config.
 *
 * @extends {AppError} - The generic `AppError` class.
 */
export default class ConfigValidationError extends AppError {
  /**
   * The severity level of the error.
   * @type {'error'}
   * @readonly
   */
  severity: "error";

  constructor(message: string) {
    super(message);
    this.severity = "error";
  }
}
