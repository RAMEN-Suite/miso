import express, { Request, Response, Router, NextFunction } from "express";
import annotationRoutes from "./annotations.routes.js";
import textRoutes from "./text.routes.js";
import CollectionService from "../services/collection.service.js";
import { CollectionNode, NodeAncestry, PaginationResult, NodeDto, NodeStatusObject } from "../models/types.js";
import { getPagination } from "../utils/helper.js";

const router: Router = express.Router({ mergeParams: true });

const collectionService: CollectionService = new CollectionService();

router.get("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.params.uuid;

  try {
    const collection: NodeDto<CollectionNode> = await collectionService.getCollection(uuid);

    res.status(200).json(collection);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.params.uuid;
  const data: NodeStatusObject = req.body;

  try {
    const updatedCollection: NodeDto<CollectionNode> = await collectionService.updateCollection(uuid, data);

    res.status(200).json(updatedCollection);
  } catch (error: unknown) {
    next(error);
  }
});

router.use("/:collectionUuid/annotations", annotationRoutes);
router.use("/:collectionUuid/texts", textRoutes);

export default router;
