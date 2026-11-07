import AppError from "./app.error.js";
import type { ElementDiagnostic } from "../models/types.js";

/**
 * Represents an error for validation failures (e.g. missing required fields in the payload).
 *
 * @extends {AppError} - The generic `AppError` class.
 */
export default class ValidationError extends AppError {
  /** The findings of a write validated with the model, sent with the error response */
  public diagnostics?: ElementDiagnostic[];

  constructor(message: string, diagnostics?: ElementDiagnostic[]) {
    super(400, message);
    this.diagnostics = diagnostics;
  }
}
