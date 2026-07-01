import { Router } from "express";
import { env } from "../config/env.js";
import { oclClient } from "../ocl/client.js";
import { getSupabase } from "../config/supabase.js";

export const healthRoutes = Router();

healthRoutes.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tabibu-concept-gateway" });
});

healthRoutes.get("/ready", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {
    supabase: "error",
    ocl: "error",
  };

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("collections").select("id").limit(1);
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  try {
    const oclRes = await oclClient.get(`/orgs/${env.OCL_ORG}/`);
    checks.ocl = oclRes.status === 200 ? "ok" : "error";
  } catch {
    checks.ocl = "error";
  }

  const ready = Object.values(checks).every((v) => v === "ok");
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "degraded", checks });
});
