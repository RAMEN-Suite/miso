import express, { Request, Response, Router, NextFunction } from "express";
import characterRoutes from "./characters.routes.js";
import annotationRoutes from "./annotations.routes.js";
import TextService from "../services/text.service.js";
import { TextNode, TextAccessObject, TextUpdateDto } from "../models/types.js";

const router: Router = express.Router({ mergeParams: true });

const textService: TextService = new TextService();

// GET /texts/:textUuid
router.get("/:textUuid", async (req: Request, res: Response, next: NextFunction) => {
  const textUuid: string = req.params.textUuid; // This is the specific text UUID

  try {
    const text: TextAccessObject = await textService.getExtendedTextByUuid(textUuid);

    res.status(200).json(text);
  } catch (error: unknown) {
    next(error);
  }
});

router.post("/:uuid", async (req: Request, res: Response, next: NextFunction) => {
  const uuid: string = req.params.uuid;
  const data: TextUpdateDto = req.body;

  try {
    const updatedTextNode: TextNode = await textService.updateText(uuid, data);

    res.status(200).json(updatedTextNode);
  } catch (error: unknown) {
    next(error);
  }
});

router.use("/:textUuid/characters", characterRoutes);
router.use("/:textUuid/annotations", annotationRoutes);

export default router;
