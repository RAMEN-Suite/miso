import express, { Request, Response, Router, NextFunction } from "express";
import { ElementResponse, PaginationResult } from "../models/types.js";
import { getPagination } from "../utils/helper.js";
import SearchService from "../services/search.service.js";
import ValidationError from "../errors/validation.error.js";

const router: Router = express.Router({ mergeParams: true });
const searchService: SearchService = new SearchService();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classifierRef: unknown = req.query.classifier;

    if (typeof classifierRef !== "string" || classifierRef === "") {
      throw new ValidationError("`classifier` (the qualified ref of a node type) is required.");
    }

    const nodes: PaginationResult<ElementResponse> = await searchService.searchNodes({
      classifierRef,
      ...getPagination(req),
    });

    res.status(200).json(nodes);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
