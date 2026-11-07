import express, { Request, Response, Router, NextFunction } from "express";
import HierarchyService from "../services/hierarchy.service.js";
import ConfigService from "../services/config.service.js";
import { ElementResponse, PaginationResult, ModelAttribute, ModelContext } from "../models/types.js";
import { parseCreateNodePayload, parseHierarchyQuery, parseUuidFrom, parseUuidListFrom } from "../utils/helper.js";
import { filterableProperties } from "../utils/filter.js";
import { decodeCursor, HierarchyCursor, querySignature as createQuerySignature } from "../utils/cursor.js";

const router: Router = express.Router();

const hierarchyService: HierarchyService = new HierarchyService();
const configService: ConfigService = new ConfigService();

/**
 * The single hierarchy listing endpoint. What is listed is decided by the `scope` in the body —
 * a Collection's children or all of its descendants, the top of the hierarchy, every node of the
 * hierarchy, or an explicit set of uuids (everything carrying one client-side tag) — with identical
 * filter, sort and cursor semantics for all of them.
 *
 * This is a **read**, not a mutation. It is a POST because the parameters do not reliably fit in a
 * URI (large uuid lists, long cursor strings, complex filters etc.)
 */
router.post("/query", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context: ModelContext = await configService.getModelContext();
    const properties: Map<string, ModelAttribute> = filterableProperties(context);

    const { scope, filters, sort, order, limit, cursor } = parseHierarchyQuery(req, context, properties);
    const signature: string = createQuerySignature({ scope, filters, sort, order });
    const decodedCursor: HierarchyCursor | null = cursor ? decodeCursor(cursor, signature) : null;

    const nodes: PaginationResult<ElementResponse> = await hierarchyService.listNodes(scope, {
      filters,
      sort,
      order,
      limit,
      cursor: decodedCursor,
      signature,
      properties,
      context,
    });

    res.status(200).set("Cache-Control", "no-store").json(nodes);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/nodes", async (req: Request, res: Response, next: NextFunction) => {
  const { uuid, data } = parseCreateNodePayload(req);

  try {
    const node: ElementResponse = await hierarchyService.createNode(uuid, data);

    res.status(201).json(node);
  } catch (error: unknown) {
    next(error);
  }
});

router.get("/ancestry/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);

  try {
    const ancestry: ElementResponse = await hierarchyService.getAncestry(uuid);

    res.status(200).json(ancestry);
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * Deletes one or several nodes, all or nothing. A POST, since a DELETE body is not reliably supported.
 */
router.post("/nodes/delete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uuids: string[] = parseUuidListFrom((req.body ?? {}) as Record<string, unknown>, "uuids", 1000);
    const deleted: string[] = await hierarchyService.deleteNodes(uuids);

    res.status(200).json({ deleted });
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
