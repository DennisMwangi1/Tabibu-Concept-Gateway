import { Router } from "express";
import { buildBundleForHospital } from "../bundles/buildBundle.js";
import { getSupabase } from "../config/supabase.js";
import { deriveSubscriptionsForHospital } from "../subscriptions/deriveSubscriptions.js";
import { markRolloutApplied } from "../upgrades/rolloutService.js";

export const hospitalRoutes = Router();

/**
 * Returns the full concept bundle for a hospital based on provisioned app modules.
 * No upgrade rollout required — initial sync path.
 */
hospitalRoutes.get("/hospitals/:id/bundle", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;

    await deriveSubscriptionsForHospital(hospitalId);
    const bundle = await buildBundleForHospital(hospitalId);

    const supabase = getSupabase();
    await supabase.from("sync_log").insert({
      hospital_id: hospitalId,
      event_type: "bundle_requested",
      detail: {
        collections: bundle.collections,
        concept_count: bundle.concepts.length,
      },
    });

    res.json({ bundle });
  } catch (err) {
    next(err);
  }
});

/** Hospital reports that a bundle was applied successfully (or failed). */
hospitalRoutes.post("/hospitals/:id/bundle-applied", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;
    const { success, failureReason, collections } = req.body as {
      success: boolean;
      failureReason?: string;
      collections?: Array<{ id: string; version: string }>;
    };

    const supabase = getSupabase();
    await supabase.from("sync_log").insert({
      hospital_id: hospitalId,
      event_type: success ? "bundle_applied" : "bundle_apply_failed",
      detail: { failureReason, collections },
    });

    // Resolve any pending rollouts whose target version the hospital just confirmed.
    const { data: pending } = await supabase
      .from("concept_upgrade_rollouts")
      .select("id, collection_id, to_version")
      .eq("hospital_id", hospitalId)
      .eq("status", "pending");

    for (const rollout of pending ?? []) {
      const appliedCollection = (collections ?? []).find(
        (c) => c.id === rollout.collection_id && c.version === rollout.to_version,
      );
      if (success && appliedCollection) {
        await markRolloutApplied(rollout.id, hospitalId, true);
      } else if (!success) {
        await markRolloutApplied(rollout.id, hospitalId, false, failureReason);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Lists provisioned app modules and derived collection subscriptions. */
hospitalRoutes.get("/hospitals/:id/subscriptions", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;
    await deriveSubscriptionsForHospital(hospitalId);

    const supabase = getSupabase();
    const { data: modules } = await supabase
      .from("hospital_app_modules")
      .select("app_module, enabled_at")
      .eq("hospital_id", hospitalId)
      .is("disabled_at", null);

    const { data: subscriptions } = await supabase
      .from("hospital_module_subscriptions")
      .select("collection_id, pinned_version, auto_derived")
      .eq("hospital_id", hospitalId);

    res.json({ modules: modules ?? [], subscriptions: subscriptions ?? [] });
  } catch (err) {
    next(err);
  }
});
