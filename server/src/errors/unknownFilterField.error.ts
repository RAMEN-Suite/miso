import ValidationError from "./validation.error.js";

/**
 * Represents a filter or sort that names a node property the guidelines do not define.
 *
 * Distinct from a plain {@link ValidationError} (a malformed request) on purpose: a stored listing
 * definition — a smart folder — can name a property that a later guidelines edit removed. That is a
 * recoverable, expected condition the client should be able to react to (drop the rule, tell the
 * user) rather than a bug in the request it just built.
 *
 * @extends {ValidationError} - Still a 400 if thrown.
 */
export default class UnknownFilterFieldError extends ValidationError {
  public readonly field: string;

  constructor(field: string) {
    super(`Unknown filter field "${field}".`);

    this.field = field;
  }
}
