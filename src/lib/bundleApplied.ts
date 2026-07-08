export interface BundleAppliedCollection {
  id: string;
  version: string;
}

export interface BundleAppliedPayload {
  success: boolean;
  failureReason?: string;
  collections: BundleAppliedCollection[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeCollection(entry: unknown): BundleAppliedCollection | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  const id = asString(row.id) ?? asString(row.collection_id);
  const version = asString(row.version) ?? asString(row.pinned_version);
  if (!id || !version) return null;
  return { id, version };
}

/**
 * Normalizes bundle-applied request bodies from the Go sync client.
 * Treats omitted `success` as success unless a failure reason or failed status is present.
 */
export function parseBundleAppliedBody(body: unknown): BundleAppliedPayload {
  const b = (body ?? {}) as Record<string, unknown>;

  const failureReason =
    asString(b.failureReason) ?? asString(b.failure_reason);

  let success: boolean;
  if (typeof b.success === "boolean") {
    success = b.success;
  } else if (typeof b.Success === "boolean") {
    success = b.Success;
  } else if (failureReason) {
    success = false;
  } else if (b.status === "failed" || b.status === "error") {
    success = false;
  } else if (b.status === "success" || b.status === "ok") {
    success = true;
  } else {
    // Go client may POST only collections on success — default to applied.
    success = true;
  }

  const rawCollections = Array.isArray(b.collections) ? b.collections : [];
  const collections = rawCollections
    .map(normalizeCollection)
    .filter((c): c is BundleAppliedCollection => c !== null);

  return { success, failureReason, collections };
}
