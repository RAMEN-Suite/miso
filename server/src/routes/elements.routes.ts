import express, { Request, Response, Router, NextFunction } from "express";
import ElementService from "../services/element.service.js";
import { ElementGraph, WriteResponse } from "../models/types.js";
import { parseWritePayload } from "../utils/helper.js";

const router: Router = express.Router();

const elementService: ElementService = new ElementService();

/**
 * Writes the changed nodes and relations of a graph in one transaction (create, update, delete, attach, remove).
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload: ElementGraph = parseWritePayload(req.body);
    const result: WriteResponse = await elementService.write(payload);

    res.status(200).json(result);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
