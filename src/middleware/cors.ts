import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const ALLOWED_HEADERS = [
  "Content-Type",
  "x-admin-api-key",
  "x-ops-api-key",
].join(", ");

/**
 * Allow browser requests from the admin UI (and other configured origins).
 * Hospital sync clients are server-side and do not need CORS.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && env.ADMIN_CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}
