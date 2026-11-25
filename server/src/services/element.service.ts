import { ElementGraph, ModelContext, NodeUpdateObject, WriteResponse } from "../models/types.js";
import { toNodeChanges } from "../utils/nodeUpdate.js";
import ConfigService from "./config.service.js";
import WriteValidationService from "./writeValidation.service.js";

export default class ElementService {
  /**
   * Writes the changed nodes and relations of a graph, validated with the model in the same transaction.
   *
   * @param {ElementGraph} payload - The changed nodes (`created`, `modified`, `deleted`) and relations (`added`, `removed`).
   * @throws {ValidationError} If the payload is malformed, or the write doesn't match the model in `enforce` mode.
   * @throws {NotFoundError} If a modified node or the end of an added relation doesn't exist (rolled back).
   * @returns {Promise<WriteResponse>} The findings of the validation and the annotations deleted as orphans.
   */
  public async write(payload: ElementGraph): Promise<WriteResponse> {
    const context: ModelContext = await ConfigService.getModelContext();
    const changes: NodeUpdateObject = toNodeChanges(context, payload);

    return new WriteValidationService().write(context, changes);
  }
}
