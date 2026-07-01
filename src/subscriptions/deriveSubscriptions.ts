import { getSupabase } from "../config/supabase.js";
import {
  APP_MODULE_TO_COLLECTION,
  CORE_COLLECTION,
} from "../config/modules.js";

/**
 * Auto-derives collection subscriptions from provisioned app modules.
 * tabibu-core is always included.
 */
export async function deriveSubscriptionsForHospital(hospitalId: string) {
  const supabase = getSupabase();

  const { data: modules, error } = await supabase
    .from("hospital_app_modules")
    .select("app_module")
    .eq("hospital_id", hospitalId)
    .is("disabled_at", null);

  if (error) throw error;

  const collectionIds = new Set<string>([CORE_COLLECTION]);
  for (const { app_module } of modules ?? []) {
    const collectionId = APP_MODULE_TO_COLLECTION[app_module];
    if (collectionId) collectionIds.add(collectionId);
  }

  for (const collectionId of collectionIds) {
    // Check if a subscription already exists — if so, leave pinned_version alone.
    // The admin controls version pins via upgrade/rollback; this function only
    // bootstraps new subscriptions for newly added modules.
    const { data: existing } = await supabase
      .from("hospital_module_subscriptions")
      .select("id")
      .eq("hospital_id", hospitalId)
      .eq("collection_id", collectionId)
      .maybeSingle();

    if (existing) continue;

    const { data: collection } = await supabase
      .from("collections")
      .select("latest_version")
      .eq("id", collectionId)
      .single();

    if (!collection?.latest_version) continue;

    const { error: insertError } = await supabase
      .from("hospital_module_subscriptions")
      .insert({
        hospital_id: hospitalId,
        collection_id: collectionId,
        pinned_version: collection.latest_version,
        auto_derived: true,
      });

    // Ignore duplicate — another request may have raced us.
    if (insertError && insertError.code !== "23505") throw insertError;
  }
}
