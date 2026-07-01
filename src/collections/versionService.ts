import { getSupabase } from "../config/supabase.js";

export interface CollectionVersionRow {
  version: string;
  released_at: string | null;
  export_cached: boolean;
}

export async function listCollectionVersions(
  collectionId: string,
): Promise<CollectionVersionRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("collection_versions")
    .select("version, released_at, export_cached")
    .eq("collection_id", collectionId)
    .order("released_at", { ascending: false });

  if (error) throw error;
  if (data && data.length > 0) return data;

  const { data: collection, error: colError } = await supabase
    .from("collections")
    .select("latest_version")
    .eq("id", collectionId)
    .maybeSingle();

  if (colError) throw colError;
  if (collection?.latest_version) {
    return [
      {
        version: collection.latest_version,
        released_at: null,
        export_cached: false,
      },
    ];
  }

  return [];
}
