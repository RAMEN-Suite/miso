import express, { Request, Response, Router, NextFunction } from "express";
import HierarchyService from "../services/hierarchy.service.js";
import GuidelinesService from "../services/guidelines.service.js";
import { IGuidelines } from "../models/IGuidelines.js";
import {
  HierarchyNode,
  HierarchyQuery,
  NodeAncestry,
  NodeDto,
  NodeStatusObject,
  PaginationResult,
  PropertyConfig,
} from "../models/types.js";
import { getHierarchyQuery } from "../utils/helper.js";
import { filterableProperties } from "../utils/filter.js";
import { decodeCursor, HierarchyCursor, querySignature as createQuerySignature } from "../utils/cursor.js";

const router: Router = express.Router();

const hierarchyService: HierarchyService = new HierarchyService();
const guidelinesService: GuidelinesService = new GuidelinesService();

/**
 * The single hierarchy listing endpoint. What is listed is decided by the `scope` in the body —
 * a Collection's children, the top of the hierarchy, or an explicit set of uuids (everything
 * carrying one client-side tag) — with identical filter, sort and cursor semantics for all three.
 *
 * This is a **read**, not a mutation. It is a POST because the parameters do not reliably fit in a
 * URI (large uuid lists, long cursor strings, complex filters etc.)
 */
router.post("/query", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guidelines: IGuidelines = await guidelinesService.getGuidelines();
    const properties: Map<string, PropertyConfig> = filterableProperties(guidelines);

    const query: HierarchyQuery = getHierarchyQuery(req, properties);
    const { scope, filters, sort, direction, limit, cursor } = query;

    const signature: string = createQuerySignature({ scope, filters, sort, direction });
    const decodedCursor: HierarchyCursor | null = cursor ? decodeCursor(cursor, signature) : null;

    const nodes: PaginationResult<NodeDto<HierarchyNode>[]> = await hierarchyService.listNodes(scope, {
      filters,
      sort,
      direction,
      limit,
      cursor: decodedCursor,
      signature,
      properties,
    });

    res.status(200).set("Cache-Control", "no-store").json(nodes);
  } catch (error: unknown) {
    next(error);
  }
});

router.get("/path", async (req: Request, res: Response, next: NextFunction) => {
  const uuidString: string | null = req.query.path as string | null;
  const uuids: string[] = uuidString ? uuidString.split(",") : [];

  try {
    const path: NodeDto<HierarchyNode>[] = await hierarchyService.validatePath(uuids);

    res.status(200).json(path);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/nodes", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.body.uuid;
  const data: NodeStatusObject = req.body.data;

  try {
    const node: NodeDto<HierarchyNode> = await hierarchyService.createNode(uuid, data);

    res.status(201).json(node);
  } catch (error: unknown) {
    next(error);
  }
});

router.get("/ancestry/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.params.uuid;

  try {
    const ancestryPaths: NodeAncestry[] = await hierarchyService.getAncestry(uuid);

    res.status(200).json(ancestryPaths);
  } catch (error: unknown) {
    next(error);
  }
});

router.delete("/nodes/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.params.uuid;

  try {
    const node: NodeDto<HierarchyNode> = await hierarchyService.deleteNode(uuid);

    res.status(200).json(node);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
