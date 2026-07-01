import { getSupabase } from "../config/supabase.js";

export async function getPendingRollout(hospitalId: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("concept_upgrade_rollouts")
    .select("*")
    .eq("hospital_id", hospitalId)
    .eq("status", "pending")
    .order("triggered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markRolloutApplied(
  rolloutId: number,
  hospitalId: string,
  success: boolean,
  failureReason?: string,
) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("concept_upgrade_rollouts")
    .update({
      status: success ? "applied" : "failed",
      applied_at: success ? new Date().toISOString() : null,
      failure_reason: success ? null : (failureReason ?? "unknown"),
    })
    .eq("id", rolloutId)
    .eq("hospital_id", hospitalId);

  if (error) throw error;
}

export async function listRolloutsForHospital(hospitalId: string) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("concept_upgrade_rollouts")
    .select("*")
    .eq("hospital_id", hospitalId)
    .order("triggered_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
