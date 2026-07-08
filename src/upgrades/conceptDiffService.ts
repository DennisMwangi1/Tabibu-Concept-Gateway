import { getSupabase } from "../config/supabase.js";
import type { ConceptDiffRow } from "./diffReport.js";

export async function insertConceptDiffs(
  rolloutId: number,
  collectionId: string,
  fromVersion: string | null,
  toVersion: string,
  diffs: ConceptDiffRow[],
) {
  if (diffs.length === 0) return;

  const supabase = getSupabase();
  const rows = diffs.map((d) => ({
    rollout_id: rolloutId,
    collection_id: collectionId,
    from_version: fromVersion,
    to_version: toVersion,
    concept_uuid: d.concept_uuid,
    change_type: d.change_type,
    field_changes: d.field_changes ?? null,
  }));

  const { error } = await supabase.from("concept_diffs").insert(rows);
  if (error) throw error;
}

export async function listConceptDiffsForRollout(rolloutId: number) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("concept_diffs")
    .select("*")
    .eq("rollout_id", rolloutId)
    .order("change_type")
    .order("concept_uuid");

  if (error) throw error;
  return data ?? [];
}
