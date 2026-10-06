import express, { Request, Response, Router, NextFunction } from "express";
import { CollectionNode, PaginationResult, TextNode, EntityNode, NodeSearchParams } from "../models/types.js";
import { getPagination } from "../utils/helper.js";
import SearchService from "../services/search.service.js";

const router: Router = express.Router({ mergeParams: true });
const searchService: SearchService = new SearchService();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, order, search }: NodeSearchParams = getPagination(req);
    const scope: "Collection" | "Entity" | "Content" = req.query.scope as "Collection" | "Entity" | "Content";

    if (!scope) {
      return [];
    }

    const nodeLabels: string[] = (req.query.nodeLabels as string).split(",").filter((label) => label.trim() !== "");

    const nodes: PaginationResult<(CollectionNode | EntityNode | TextNode)[]> = await searchService.searchNodes(scope, {
      nodeLabels,
      limit,
      order,
      offset,
      search,
    } as Required<NodeSearchParams>);

    res.status(200).json(nodes);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
