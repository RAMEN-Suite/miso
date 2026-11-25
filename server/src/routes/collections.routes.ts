import express, { Request, Response, Router, NextFunction } from "express";
import CollectionService from "../services/collection.service.js";
import { ElementResponse } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";
import ValidationError from "../errors/validation.error.js";

const router: Router = express.Router({ mergeParams: true });

const collectionService: CollectionService = new CollectionService();

router.get("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);

  try {
    const collection: ElementResponse = await collectionService.getCollection(uuid);

    res.status(200).json(collection);
  } catch (error: unknown) {
    next(error);
  }
});

router.patch("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);
  const { properties } = (req.body ?? {}) as { properties?: unknown };

  try {
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      throw new ValidationError("`properties` must be an object.");
    }

    const updatedCollection: ElementResponse = await collectionService.patchCollectionProperties(
      uuid,
      properties as Record<string, unknown>,
    );

    res.status(200).json(updatedCollection);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
