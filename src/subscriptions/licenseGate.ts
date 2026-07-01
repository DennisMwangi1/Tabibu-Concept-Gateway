import { getSupabase } from "../config/supabase.js";

export interface LicenseCheckResult {
  collectionId: string;
  isLicensed: boolean;
  reason?: string;
}

/**
 * Returns whether a hospital is entitled to an optional/restricted collection.
 */
export async function isCollectionLicensed(
  hospitalId: string,
  collectionId: string,
): Promise<LicenseCheckResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("hospital_license_flags")
    .select("is_licensed, expires_at")
    .eq("hospital_id", hospitalId)
    .eq("collection_id", collectionId)
    .maybeSingle();

  if (error) throw error;

  if (!data?.is_licensed) {
    return { collectionId, isLicensed: false, reason: "not_licensed" };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { collectionId, isLicensed: false, reason: "license_expired" };
  }

  return { collectionId, isLicensed: true };
}

export async function getLicensedAddonCollections(hospitalId: string) {
  const supabase = getSupabase();

  const { data: licenses, error } = await supabase
    .from("hospital_license_flags")
    .select("collection_id, is_licensed, expires_at")
    .eq("hospital_id", hospitalId)
    .eq("is_licensed", true);

  if (error) throw error;

  const now = new Date();
  return (licenses ?? []).filter(
    (l) => !l.expires_at || new Date(l.expires_at) > now,
  );
}
