import express, { Request, Response, Router, NextFunction } from "express";
import annotationRoutes from "./annotations.routes.js";
import CollectionService from "../services/collection.service.js";
import { CollectionNode, NodeDto, NodeStatusObject } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";
import ValidationError from "../errors/validation.error.js";

const router: Router = express.Router({ mergeParams: true });

const collectionService: CollectionService = new CollectionService();

router.get("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);

  try {
    const collection: NodeDto<CollectionNode> = await collectionService.getCollection(uuid);

    res.status(200).json(collection);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);
  const data: NodeStatusObject = req.body as NodeStatusObject;

  try {
    const updatedCollection: NodeDto<CollectionNode> = await collectionService.updateCollection(uuid, data);

    res.status(200).json(updatedCollection);
  } catch (error: unknown) {
    next(error);
  }
});

router.patch("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);
  const { nodeLabels, properties } = (req.body ?? {}) as { nodeLabels?: unknown; properties?: unknown };

  // TODO: This will be unnecessary when ramen-core is implemented
  try {
    if (!Array.isArray(nodeLabels) || !nodeLabels.every((label: unknown) => typeof label === "string")) {
      throw new ValidationError("`nodeLabels` must be an array of strings.");
    }

    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      throw new ValidationError("`properties` must be an object.");
    }

    const updatedCollection: NodeDto<CollectionNode> = await collectionService.patchCollectionProperties(
      uuid,
      nodeLabels as string[],
      properties as Record<string, unknown>,
    );

    res.status(200).json(updatedCollection);
  } catch (error: unknown) {
    next(error);
  }
});

router.use("/:collectionUuid/annotations", annotationRoutes);

export default router;
