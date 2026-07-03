// ─── Domain types mirrored from the gateway DB schema ───────────────────────

export interface Hospital {
  id: string;
  name: string;
  kmhfl_code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface HospitalSummary extends Hospital {
  active_module_count: number;
  subscriptions: CollectionSubscription[];
  last_synced_at: string | null;
}

export interface AppModule {
  app_module: string;
  enabled_at: string;
  disabled_at: string | null;
}

export interface CollectionSubscription {
  collection_id: string;
  pinned_version: string | null;
  auto_derived: boolean;
  subscribed_at?: string;
}

export interface Collection {
  id: string;
  app_module: string | null;
  is_core: boolean;
  is_optional_addon: boolean;
  latest_version: string | null;
  created_at: string;
  label: string;
}

export interface SyncEvent {
  id: number;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface UpgradeReport {
  id: number;
  rollout_id: number;
  hospital_id: string;
  collection_id: string;
  from_version: string | null;
  to_version: string;
  changed_concepts: unknown[];
  retired_concepts: unknown[];
  generated_at: string;
}

export interface UpgradeRollout {
  id: number;
  hospital_id: string;
  collection_id: string;
  from_version: string | null;
  to_version: string;
  status: "pending" | "applied" | "failed";
  triggered_by: string;
  triggered_at: string;
  applied_at: string | null;
  failure_reason: string | null;
}

export interface HospitalDetail {
  hospital: Hospital;
  modules: AppModule[];
  subscriptions: CollectionSubscription[];
  recent_sync_log: SyncEvent[];
}

// ─── API response wrappers ───────────────────────────────────────────────────

export interface HospitalListResponse {
  hospitals: HospitalSummary[];
}

export interface HospitalDetailResponse extends HospitalDetail {}

export interface RegisterHospitalResponse {
  hospital: Hospital;
  subscriptions: CollectionSubscription[];
}

export interface AddModuleResponse {
  app_module: string;
  subscriptions: CollectionSubscription[];
}

export interface UpgradeResponse {
  rolloutId: number;
  fromVersion: string | null;
  toVersion: string;
  changedCount: number;
  retiredCount: number;
}

export interface CollectionVersion {
  version: string;
  released_at: string | null;
  export_cached: boolean;
}

export interface CollectionVersionsResponse {
  collectionId: string;
  versions: CollectionVersion[];
}

export interface UpgradeAllResponse {
  upgrades: Array<{
    rolloutId: number;
    collectionId: string;
    fromVersion: string | null;
    toVersion: string;
    changedCount: number;
    retiredCount: number;
  }>;
  skipped: Array<{
    collectionId: string;
    reason: "already_at_latest" | "no_versions";
    pinnedVersion: string | null;
  }>;
}

export interface CollectionsResponse {
  collections: Collection[];
}

export interface ModuleCatalogResponse {
  core: {
    collection_id: string;
    label: string;
    description: string;
    chip_color: string;
  };
  modules: Array<{
    app_module: string;
    collection_id: string;
    label: string;
    description: string;
    chip_color: string;
  }>;
}

export interface PackagingCollectionStatus {
  id: string;
  label: string;
  app_module: string | null;
  is_core: boolean;
  latest_version: string | null;
  export_ready: boolean;
}

export interface PackagingStatusResponse {
  org: string;
  all_exports_ready: boolean;
  collections: PackagingCollectionStatus[];
  checked_at: string;
}

export interface ReportsResponse {
  reports: UpgradeReport[];
}

export interface SyncLogResponse {
  sync_log: SyncEvent[];
}
