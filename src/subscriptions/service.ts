import { deriveSubscriptionsForHospital } from "./deriveSubscriptions.js";
import { getLicensedAddonCollections } from "./licenseGate.js";
import { getSupabase } from "../config/supabase.js";

export async function syncHospitalSubscriptions(hospitalId: string) {
  await deriveSubscriptionsForHospital(hospitalId);
}

export async function listHospitalSubscriptions(hospitalId: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("hospital_module_subscriptions")
    .select("collection_id, pinned_version, auto_derived, subscribed_at")
    .eq("hospital_id", hospitalId);

  if (error) throw error;
  return data ?? [];
}

export async function getSubscribedCollectionsWithAddons(hospitalId: string) {
  const supabase = getSupabase();

  const { data: subscriptions, error: subError } = await supabase
    .from("hospital_module_subscriptions")
    .select("collection_id, pinned_version")
    .eq("hospital_id", hospitalId);

  if (subError) throw subError;

  const licensedAddons = await getLicensedAddonCollections(hospitalId);
  const licensedIds = new Set(licensedAddons.map((l) => l.collection_id));

  const { data: addons, error: addonError } = await supabase
    .from("collections")
    .select("id, latest_version")
    .eq("is_optional_addon", true);

  if (addonError) throw addonError;

  const addonTargets = (addons ?? [])
    .filter((a) => licensedIds.has(a.id) && a.latest_version)
    .map((a) => ({
      collection_id: a.id,
      pinned_version: a.latest_version!,
    }));

  return [...(subscriptions ?? []), ...addonTargets];
}
