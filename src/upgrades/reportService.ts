import { getSupabase } from "../config/supabase.js";

export async function listUpgradeReports(hospitalId: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("concept_upgrade_reports")
    .select("*")
    .eq("hospital_id", hospitalId)
    .order("generated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createUpgradeReport(input: {
  rolloutId: number;
  hospitalId: string;
  collectionId: string;
  fromVersion: string | null;
  toVersion: string;
  changedConcepts: unknown[];
  retiredConcepts: unknown[];
}) {
  const supabase = getSupabase();

  const { error } = await supabase.from("concept_upgrade_reports").insert({
    rollout_id: input.rolloutId,
    hospital_id: input.hospitalId,
    collection_id: input.collectionId,
    from_version: input.fromVersion,
    to_version: input.toVersion,
    changed_concepts: input.changedConcepts,
    retired_concepts: input.retiredConcepts,
  });

  if (error) throw error;
}
