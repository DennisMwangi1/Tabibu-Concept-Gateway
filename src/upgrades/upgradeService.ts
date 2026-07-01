import { getSupabase } from "../config/supabase.js";
import { nextVersionAfter } from "../lib/versionUtils.js";
import { listCollectionVersions } from "../collections/versionService.js";
import { diffCollectionVersions } from "./diffReport.js";
import { createUpgradeReport } from "./reportService.js";

export interface UpgradeResult {
  rolloutId: number;
  collectionId: string;
  fromVersion: string | null;
  toVersion: string;
  changedCount: number;
  retiredCount: number;
}

export interface SkippedUpgrade {
  collectionId: string;
  reason: "already_at_latest" | "no_versions";
  pinnedVersion: string | null;
}

export async function triggerCollectionUpgrade(
  hospitalId: string,
  collectionId: string,
  toVersion: string,
  triggeredBy = "admin",
): Promise<UpgradeResult> {
  const supabase = getSupabase();

  const { data: current } = await supabase
    .from("hospital_module_subscriptions")
    .select("pinned_version")
    .eq("hospital_id", hospitalId)
    .eq("collection_id", collectionId)
    .maybeSingle();

  const fromVersion = current?.pinned_version ?? null;

  if (fromVersion === toVersion) {
    throw new Error(
      `Hospital is already on ${toVersion} for collection ${collectionId}`,
    );
  }

  const { data: rollout, error: rolloutError } = await supabase
    .from("concept_upgrade_rollouts")
    .insert({
      hospital_id: hospitalId,
      collection_id: collectionId,
      from_version: fromVersion,
      to_version: toVersion,
      status: "pending",
      triggered_by: triggeredBy,
    })
    .select()
    .single();

  if (rolloutError) throw rolloutError;

  const { changedConcepts, retiredConcepts } = await diffCollectionVersions(
    collectionId,
    fromVersion,
    toVersion,
  );

  await createUpgradeReport({
    rolloutId: rollout.id,
    hospitalId,
    collectionId,
    fromVersion,
    toVersion,
    changedConcepts,
    retiredConcepts,
  });

  // Update the pin immediately — the hospital gets the new bundle on its next sync.
  const { error: pinError } = await supabase
    .from("hospital_module_subscriptions")
    .update({ pinned_version: toVersion })
    .eq("hospital_id", hospitalId)
    .eq("collection_id", collectionId);

  if (pinError) throw pinError;

  return {
    rolloutId: rollout.id,
    collectionId,
    fromVersion,
    toVersion,
    changedCount: changedConcepts.length,
    retiredCount: retiredConcepts.length,
  };
}

export async function triggerNextUpgradesForHospital(
  hospitalId: string,
  triggeredBy = "admin",
): Promise<{ upgrades: UpgradeResult[]; skipped: SkippedUpgrade[] }> {
  const supabase = getSupabase();

  const { data: subscriptions, error } = await supabase
    .from("hospital_module_subscriptions")
    .select("collection_id, pinned_version")
    .eq("hospital_id", hospitalId);

  if (error) throw error;

  const upgrades: UpgradeResult[] = [];
  const skipped: SkippedUpgrade[] = [];

  for (const sub of subscriptions ?? []) {
    const versions = await listCollectionVersions(sub.collection_id);
    const versionIds = versions.map((v) => v.version);
    const next = nextVersionAfter(sub.pinned_version, versionIds);

    if (!next) {
      skipped.push({
        collectionId: sub.collection_id,
        reason: versionIds.length === 0 ? "no_versions" : "already_at_latest",
        pinnedVersion: sub.pinned_version,
      });
      continue;
    }

    if (sub.pinned_version === next) {
      skipped.push({
        collectionId: sub.collection_id,
        reason: "already_at_latest",
        pinnedVersion: sub.pinned_version,
      });
      continue;
    }

    const result = await triggerCollectionUpgrade(
      hospitalId,
      sub.collection_id,
      next,
      triggeredBy,
    );
    upgrades.push(result);
  }

  return { upgrades, skipped };
}
