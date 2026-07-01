import { Router, type Request, type Response, type NextFunction } from "express";
import { env } from "../config/env.js";
import { getSupabase } from "../config/supabase.js";
import { UnauthorizedError } from "../lib/errors.js";
import { diffCollectionVersions } from "../upgrades/diffReport.js";
import { createUpgradeReport } from "../upgrades/reportService.js";
import { listRolloutsForHospital } from "../upgrades/rolloutService.js";

export const opsRoutes = Router();

function requireOpsKey(req: Request, _res: Response, next: NextFunction) {
  const key = req.header("x-ops-api-key");
  if (!key || key !== env.OPS_API_KEY) {
    return next(new UnauthorizedError("Invalid or missing ops API key"));
  }
  next();
}

opsRoutes.use(requireOpsKey);

opsRoutes.post("/ops/hospitals/:id/rollouts", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;
    const { collectionId, toVersion, triggeredBy } = req.body as {
      collectionId: string;
      toVersion: string;
      triggeredBy: string;
    };

    const supabase = getSupabase();

    const { data: current } = await supabase
      .from("hospital_module_subscriptions")
      .select("pinned_version")
      .eq("hospital_id", hospitalId)
      .eq("collection_id", collectionId)
      .maybeSingle();

    const { data: rollout, error } = await supabase
      .from("concept_upgrade_rollouts")
      .insert({
        hospital_id: hospitalId,
        collection_id: collectionId,
        from_version: current?.pinned_version ?? null,
        to_version: toVersion,
        status: "pending",
        triggered_by: triggeredBy,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { changedConcepts, retiredConcepts } = await diffCollectionVersions(
      collectionId,
      current?.pinned_version ?? null,
      toVersion,
    );

    await createUpgradeReport({
      rolloutId: rollout.id,
      hospitalId,
      collectionId,
      fromVersion: current?.pinned_version ?? null,
      toVersion,
      changedConcepts,
      retiredConcepts,
    });

    res.status(201).json({ rolloutId: rollout.id });
  } catch (err) {
    next(err);
  }
});

opsRoutes.get("/ops/hospitals/:id/rollouts", async (req, res, next) => {
  try {
    const rollouts = await listRolloutsForHospital(req.params.id);
    res.json({ rollouts });
  } catch (err) {
    next(err);
  }
});
