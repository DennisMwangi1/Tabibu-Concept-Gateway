import type { NextFunction, Request, Response } from "express";
import { getSupabase } from "../config/supabase.js";
import { UnauthorizedError } from "../lib/errors.js";
import { verifyHospitalApiKey } from "../lib/hospitalApiKey.js";

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Verifies the hospital API key in Authorization: Bearer <key> matches the
 * hospital :id in the URL. A key only authorizes its own hospital.
 */
export async function requireHospitalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const hospitalId = req.params.id;
    if (!hospitalId) {
      return next(new UnauthorizedError("Hospital ID required"));
    }

    const token = extractBearerToken(req);
    if (!token) {
      return next(new UnauthorizedError("Missing hospital API key"));
    }

    const supabase = getSupabase();
    const { data: hospital, error } = await supabase
      .from("hospitals")
      .select("id, api_key_hash, is_active")
      .eq("id", hospitalId)
      .maybeSingle();

    if (error) throw error;
    if (!hospital) {
      return next(new UnauthorizedError("Invalid hospital API key"));
    }
    if (!hospital.is_active) {
      return next(new UnauthorizedError("Hospital is inactive"));
    }
    if (!verifyHospitalApiKey(token, hospital.api_key_hash)) {
      return next(new UnauthorizedError("Invalid hospital API key"));
    }

    next();
  } catch (err) {
    next(err);
  }
}
