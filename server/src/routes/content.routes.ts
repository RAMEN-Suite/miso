import express, { Request, Response, Router, NextFunction } from "express";
import annotationRoutes from "./annotations.routes.js";
import ContentService from "../services/content.service.js";
import { TextNode, TextAccessObject, TextUpdateDto } from "../models/types.js";
import { parseUuidFrom } from "../utils/helper.js";

const router: Router = express.Router();

const contentService: ContentService = new ContentService();

router.get("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);

  try {
    const text: TextAccessObject = await contentService.getExtendedTextByUuid(uuid);

    res.status(200).json(text);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = parseUuidFrom(req.params, ["uuid"]);
  const data: TextUpdateDto = req.body as TextUpdateDto;

  try {
    const updatedTextNode: TextNode = await contentService.updateText(uuid, data);

    res.status(200).json(updatedTextNode);
  } catch (error: unknown) {
    next(error);
  }
});

router.use("/:contentUuid/annotations", annotationRoutes);

export default router;
