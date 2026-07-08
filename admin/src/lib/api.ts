import type {
  AddModuleResponse,
  CollectionVersionsResponse,
  CollectionsResponse,
  HospitalDetailResponse,
  HospitalListResponse,
  ModuleCatalogResponse,
  NarrativeReportResponse,
  PackagingStatusResponse,
  RegisterHospitalResponse,
  ReportsResponse,
  RotateKeyResponse,
  SyncLogResponse,
  UpgradeAllResponse,
  UpgradeResponse,
} from "./types";
import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_GATEWAY_URL ?? "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, "Not signed in");
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

// ─── Hospitals ───────────────────────────────────────────────────────────────

export const api = {
  hospitals: {
    list: () => request<HospitalListResponse>("/admin/hospitals"),

    get: (id: string) =>
      request<HospitalDetailResponse>(`/admin/hospitals/${id}`),

    register: (data: {
      name: string;
      kmhfl_code?: string;
      modules?: string[];
    }) =>
      request<RegisterHospitalResponse>("/admin/hospitals", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: { name?: string; kmhfl_code?: string; is_active?: boolean },
    ) =>
      request<{ hospital: RegisterHospitalResponse["hospital"] }>(
        `/admin/hospitals/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
      ),

    rotateKey: (id: string) =>
      request<RotateKeyResponse>(`/admin/hospitals/${id}/rotate-key`, {
        method: "POST",
      }),

    addModule: (id: string, app_module: string) =>
      request<AddModuleResponse>(`/admin/hospitals/${id}/modules`, {
        method: "POST",
        body: JSON.stringify({ app_module }),
      }),

    removeModule: (id: string, app_module: string) =>
      request<{ ok: boolean }>(`/admin/hospitals/${id}/modules/${app_module}`, {
        method: "DELETE",
      }),

    upgrade: (
      id: string,
      data: { collectionId: string; toVersion: string; triggeredBy?: string },
    ) =>
      request<UpgradeResponse>(`/admin/hospitals/${id}/upgrade`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    upgradeAll: (id: string, triggeredBy = "admin-ui") =>
      request<UpgradeAllResponse>(`/admin/hospitals/${id}/upgrade-all`, {
        method: "POST",
        body: JSON.stringify({ triggeredBy }),
      }),

    reports: (id: string) =>
      request<ReportsResponse>(`/admin/hospitals/${id}/reports`),

    narrativeReport: (id: string, rolloutId: number) =>
      request<NarrativeReportResponse>(
        `/admin/hospitals/${id}/reports/${rolloutId}`,
      ),

    syncLog: (id: string, limit?: number) =>
      request<SyncLogResponse>(
        `/admin/hospitals/${id}/sync-log${limit ? `?limit=${limit}` : ""}`,
      ),
  },

  collections: {
    list: () => request<CollectionsResponse>("/admin/collections"),

    versions: (id: string) =>
      request<CollectionVersionsResponse>(`/admin/collections/${id}/versions`),
  },

  packaging: {
    status: () => request<PackagingStatusResponse>("/admin/packaging/status"),
  },

  modules: {
    catalog: () => request<ModuleCatalogResponse>("/admin/modules"),
  },
};
