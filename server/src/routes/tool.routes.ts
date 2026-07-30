import express, { NextFunction, Request, Response, Router } from "express";
import ValidationError from "../errors/validation.error.js";
import { getToolUrl } from "../utils/helper.js";

const router: Router = express.Router();

/**
 * Redirects to a per-project external tool. Any path following the tool name is forwarded onto the
 * tool's server-configured base URL, e.g. GET /api/tools/tori/entity/:uuid redirects to
 * <tool-base-url>/entity/:uuid. Without a trailing path it redirects to the tool's base URL itself.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The next middleware function in the stack.
 * @returns {void} This function does not return any value.
 */
function handleRedirect(req: Request, res: Response, next: NextFunction): void {
  try {
    const baseUrl: string = getToolUrl(req.params.toolName);

    const rest: string = (req.params[0] ?? "").replace(/^\/+/, "");
    const queryIndex: number = req.originalUrl.indexOf("?");
    const queryString: string = queryIndex === -1 ? "" : req.originalUrl.slice(queryIndex);

    const targetStr: string = rest ? `${baseUrl.replace(/\/+$/, "")}/${rest}${queryString}` : `${baseUrl}${queryString}`;

    let targetUrl: URL;

    try {
      targetUrl = new URL(targetStr);
    } catch (error: unknown) {
      throw new ValidationError("Invalid redirect target");
    }

    if (targetUrl.origin !== new URL(baseUrl).origin) {
      throw new ValidationError("Redirect target must stay within the tool's origin");
    }

    res.redirect(302, targetStr);
  } catch (error: unknown) {
    next(error);
  }
}

router.get("/:toolName", handleRedirect);
router.get("/:toolName/*", handleRedirect);

export default router;
