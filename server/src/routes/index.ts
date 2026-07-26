import express, { Router } from "express";
import collectionRoutes from "./collections.routes.js";
import faviconRoutes from "./favicon.routes.js";
import guideLinesRoutes from "./guidelines.routes.js";
import entityRoutes from "./entities.routes.js";
import stylesRoutes from "./styles.routes.js";
import textRoutes from "./text.routes.js";
import networkRoutes from "./network.routes.js";
import hierarchyRoutes from "./hierarchy.routes.js";
import healthRoutes from "./health.routes.js";
import searchRoutes from "./search.routes.js";
import toolRoutes from "./tool.routes.js";

const router: Router = express.Router();

router.use("/health", healthRoutes);
router.use("/collections", collectionRoutes);
router.use("/guidelines", guideLinesRoutes);
router.use("/entities", entityRoutes);
router.use("/styles", stylesRoutes);
router.use("/favicon", faviconRoutes);
router.use("/texts", textRoutes);
router.use("/search", searchRoutes);
router.use("/network", networkRoutes);
router.use("/hierarchy", hierarchyRoutes);
router.use("/tools", toolRoutes);

export default router;
