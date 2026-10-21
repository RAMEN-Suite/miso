import AppError from "./app.error";

/**
 * Represents an error for guidelines that do not have the expected format, e.g. a missing block, a wrong value or an
 * unknown key. The message lists every problem with its path in the guidelines.
 *
 * @extends {AppError} - The generic `AppError` class.
 */
export default class GuidelinesValidationError extends AppError {
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
