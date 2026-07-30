import express, { Request, Response, Router, NextFunction } from "express";
import HierarchyService from "../services/hierarchy.service.js";
import { HierarchyNode, NodeAncestry, NodeDto, NodeStatusObject, PaginationResult } from "../models/types.js";
import { getHierarchyQuery } from "../utils/helper.js";
import { decodeCursor, HierarchyCursor, querySignature as createQuerySignature } from "../utils/cursor.js";

const router: Router = express.Router();

const hierarchyService: HierarchyService = new HierarchyService();

router.get("/children", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parentUuid, nodeLabels, search, sort, direction, limit, cursor } = getHierarchyQuery(req);

    const signature: string = createQuerySignature({ parentUuid, nodeLabels, search, sort, direction });
    const decodedCursor: HierarchyCursor | null = cursor ? decodeCursor(cursor, signature) : null;

    const children: PaginationResult<NodeDto<HierarchyNode>[]> = await hierarchyService.getChildren(parentUuid, {
      nodeLabels,
      search,
      sort,
      direction,
      limit,
      cursor: decodedCursor,
      signature,
    });

    res.status(200).json(children);
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
