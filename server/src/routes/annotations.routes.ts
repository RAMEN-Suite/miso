import express, { NextFunction, Request, Response, Router } from "express";
import AnnotationService from "../services/annotation.service.js";
import { IAnnotation } from "../models/IAnnotation.js";
import { Annotation, NodeDto } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";

const router: Router = express.Router({ mergeParams: true });

const annotationService: AnnotationService = new AnnotationService();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const parentUuid: string = parseUuidFrom(req.params, ["textUuid", "collectionUuid"]);

  try {
    const annotations: NodeDto[] = await annotationService.getAnnotations(parentUuid);

    res.status(200).json(annotations);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const parentUuid: string = parseUuidFrom(req.params, ["textUuid", "collectionUuid"]);
  const annotations = req.body;

  try {
    const updatedAnnotations: IAnnotation[] = await annotationService.saveAnnotations(
      parentUuid,
      "Content",
      annotations as Annotation[],
    );

    res.status(200).json(updatedAnnotations);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
