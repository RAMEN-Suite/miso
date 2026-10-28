import express, { NextFunction, Request, Response, Router } from "express";
import AnnotationService from "../services/annotation.service.js";
import { NodeDto } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";

const router: Router = express.Router();

const annotationService: AnnotationService = new AnnotationService();

/**
 * Annotations of the node `parent` (a Content or Collection). `types` (comma-separated) limits them to these top-level types.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const parentUuid: string = parseUuidFrom(req.query, ["parent"]);
  const rawTypes: unknown = req.query.types;
  const types: string[] | undefined =
    typeof rawTypes === "string" ? rawTypes.split(",").filter((type: string) => type.trim() !== "") : undefined;

  try {
    const annotations: NodeDto[] = await annotationService.getAnnotations(parentUuid, { types });

    res.status(200).json(annotations);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
