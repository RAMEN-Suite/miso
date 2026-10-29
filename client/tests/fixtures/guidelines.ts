import guidelinesJson from "./guidelines.json";
import { IGuidelines } from "../../src/models/IGuidelines";
import { parseGuidelines } from "../../src/schemas/guidelines.schema";

/**
 * Minimal guidelines for the tests, maintained by hand: the built-in structure types plus one or two types per
 * representation and extent. Validated the same way the app does on load, so format changes surface here.
 */
export const guidelines: IGuidelines = parseGuidelines(guidelinesJson);
