import type { NextFunction, Request, Response } from "express";
import { getSupabaseAdmin } from "../config/supabase.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface AdminUser {
  id: string;
  email: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Verifies Authorization: Bearer <supabase_access_token> via Supabase Auth.
 * Attaches req.user for downstream audit logging.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next(new UnauthorizedError("Missing or invalid authorization token"));
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return next(new UnauthorizedError("Invalid or expired session"));
    }

    const email = data.user.email;
    if (!email) {
      return next(new UnauthorizedError("User account has no email"));
    }

    req.user = { id: data.user.id, email };
    next();
  } catch (err) {
    next(err);
  }
}
