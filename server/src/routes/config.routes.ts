import express, { NextFunction, Request, Response, Router } from "express";
import ConfigService from "../services/config.service.js";
import { IMisoConfig } from "../models/IMisoConfig.js";

const router: Router = express.Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config: IMisoConfig = await ConfigService.getConfig();

    res.json(config);
  } catch (error: unknown) {
    next(error);
  }
});

export default router;
