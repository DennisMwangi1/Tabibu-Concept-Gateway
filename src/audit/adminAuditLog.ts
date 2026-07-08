import type { Request } from "express";
import { getSupabase } from "../config/supabase.js";
import { logger } from "../lib/logger.js";

export async function logAdminAction(
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  if (!req.user) {
    logger.warn({ action, targetType, targetId }, "Admin action without actor");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: req.user.id,
    actor_email: req.user.email,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });

  if (error) {
    logger.error({ err: error, action, targetType, targetId }, "Audit log write failed");
  }
}
