import { NextFunction, Request, Response } from "express";
import logger from "../logger.js";
import AppError from "../errors/app.error.js";

/**
 * Generic error handler.  Output error details as JSON.
 *
 * @param {unknown} error - The error object that was thrown or passed to the next function.
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} _next - The next middleware function in the stack. Unused, but Express only
 * recognises a function with four parameters as an error handler.
 * @returns {void} This function does not return any value.
 */
export default function errorMiddleware(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  logger.error("error: ", error);

  const message: string = error instanceof Error ? error.message : "Internal Server Error";
  const code: number = error instanceof AppError ? error.code : 500;

  res.status(code).json({
    status: "error",
    code,
    message,
    // This would not be ideal for production environment, but since it's commented out, no problem
    // trace: error.trace,
    // details: error.details,
  });
}
