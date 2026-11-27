import express, { NextFunction, Request, Response, Router } from "express";
import AnnotationService from "../services/annotation.service.js";
import { ElementResponse } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";

const router: Router = express.Router();

const annotationService: AnnotationService = new AnnotationService();

/**
 * Annotations of the node `parent` (a Content or Collection), in the element format. `shapes` (comma-separated shape
 * refs) limits them to the top-level annotations of these annotation shapes.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const parentUuid: string = parseUuidFrom(req.query, ["parent"]);
  const rawShapes: unknown = req.query.shapes;
  const shapes: string[] | undefined =
    typeof rawShapes === "string" ? rawShapes.split(",").filter((ref: string) => ref.trim() !== "") : undefined;

  try {
    const annotations: ElementResponse = await annotationService.getAnnotations(parentUuid, { shapes });

    res.status(200).json(annotations);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
