import { Router } from "express";
import { logAdminAction } from "../audit/adminAuditLog.js";
import { env } from "../config/env.js";
import { labelForCollection } from "../config/modules.js";
import { getModuleCatalog } from "../modules/catalog.js";
import { getSupabase } from "../config/supabase.js";
import { checkExportReady } from "../ocl/exportFetcher.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import {
  generateHospitalApiKey,
  hashHospitalApiKey,
} from "../lib/hospitalApiKey.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { deriveSubscriptionsForHospital } from "../subscriptions/deriveSubscriptions.js";
import { listCollectionVersions } from "../collections/versionService.js";
import { getOrGenerateNarrativeReport } from "../upgrades/narrativeReport.js";
import { listUpgradeReports } from "../upgrades/reportService.js";
import {
  triggerCollectionUpgrade,
  triggerNextUpgradesForHospital,
} from "../upgrades/upgradeService.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /admin/modules — provisionable module catalog for the admin UI
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/modules", (_req, res) => {
  res.json(getModuleCatalog());
});

// ---------------------------------------------------------------------------
// GET /admin/hospitals — list all hospitals with summary stats
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/hospitals", async (_req, res, next) => {
  try {
    const supabase = getSupabase();

    const { data: hospitals, error } = await supabase
      .from("hospitals")
      .select(
        `id, name, kmhfl_code, is_active, created_at,
         hospital_app_modules(app_module, enabled_at, disabled_at),
         hospital_module_subscriptions(collection_id, pinned_version),
         sync_log(created_at)`,
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const result = (hospitals ?? []).map((h) => {
      const activeModules = (h.hospital_app_modules ?? []).filter(
        (m: { disabled_at: string | null }) => !m.disabled_at,
      );
      const syncEvents = h.sync_log as Array<{ created_at: string }>;
      const lastSyncedAt =
        syncEvents.length > 0
          ? syncEvents.sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            )[0].created_at
          : null;

      return {
        id: h.id,
        name: h.name,
        kmhfl_code: h.kmhfl_code,
        is_active: h.is_active,
        created_at: h.created_at,
        active_module_count: activeModules.length,
        subscriptions: h.hospital_module_subscriptions,
        last_synced_at: lastSyncedAt,
      };
    });

    res.json({ hospitals: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/hospitals — register a hospital and provision initial modules
// ---------------------------------------------------------------------------
adminRoutes.post("/admin/hospitals", async (req, res, next) => {
  try {
    const { name, kmhfl_code, modules = [] } = req.body as {
      name: string;
      kmhfl_code?: string;
      modules?: string[];
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const supabase = getSupabase();

    if (kmhfl_code) {
      const { data: existing } = await supabase
        .from("hospitals")
        .select("id")
        .eq("kmhfl_code", kmhfl_code)
        .maybeSingle();

      if (existing) {
        throw new ConflictError(
          `A hospital with KMHFL code ${kmhfl_code} is already registered`,
        );
      }
    }

    const apiKey = generateHospitalApiKey();
    const api_key_hash = hashHospitalApiKey(apiKey);

    const { data: hospital, error: hospitalError } = await supabase
      .from("hospitals")
      .insert({ name, kmhfl_code, api_key_hash })
      .select()
      .single();

    if (hospitalError) throw hospitalError;

    if (modules.length > 0) {
      const moduleRows = modules.map((app_module: string) => ({
        hospital_id: hospital.id,
        app_module,
      }));
      const { error: moduleError } = await supabase
        .from("hospital_app_modules")
        .insert(moduleRows);
      if (moduleError) throw moduleError;
    }

    await deriveSubscriptionsForHospital(hospital.id);

    const { data: subscriptions } = await supabase
      .from("hospital_module_subscriptions")
      .select("collection_id, pinned_version")
      .eq("hospital_id", hospital.id);

    await logAdminAction(req, "hospital.create", "hospital", hospital.id, {
      name,
      kmhfl_code: kmhfl_code ?? null,
      modules,
    });

    const { api_key_hash: _hash, ...safeHospital } = hospital as Record<
      string,
      unknown
    >;

    res.status(201).json({
      hospital: safeHospital,
      subscriptions: subscriptions ?? [],
      api_key: apiKey,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/hospitals/:id — full hospital detail
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/hospitals/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: hospital, error } = await supabase
      .from("hospitals")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!hospital) throw new NotFoundError(`Hospital ${id} not found`);

    const [modulesResult, subscriptionsResult, syncLogResult] =
      await Promise.all([
        supabase
          .from("hospital_app_modules")
          .select("app_module, enabled_at, disabled_at")
          .eq("hospital_id", id)
          .order("enabled_at", { ascending: true }),
        supabase
          .from("hospital_module_subscriptions")
          .select("collection_id, pinned_version, auto_derived, subscribed_at")
          .eq("hospital_id", id),
        supabase
          .from("sync_log")
          .select("event_type, detail, created_at")
          .eq("hospital_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const { api_key_hash, ...safeHospital } = hospital;

    res.json({
      hospital: {
        ...safeHospital,
        has_api_key: !!api_key_hash,
      },
      modules: modulesResult.data ?? [],
      subscriptions: subscriptionsResult.data ?? [],
      recent_sync_log: syncLogResult.data ?? [],
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/hospitals/:id — update hospital info or active status
// ---------------------------------------------------------------------------
adminRoutes.patch("/admin/hospitals/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, kmhfl_code, is_active } = req.body as {
      name?: string;
      kmhfl_code?: string;
      is_active?: boolean;
    };

    const supabase = getSupabase();
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (kmhfl_code !== undefined) updates.kmhfl_code = kmhfl_code;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    if (kmhfl_code) {
      const { data: existing } = await supabase
        .from("hospitals")
        .select("id")
        .eq("kmhfl_code", kmhfl_code)
        .neq("id", id)
        .maybeSingle();

      if (existing) {
        throw new ConflictError(
          `A hospital with KMHFL code ${kmhfl_code} is already registered`,
        );
      }
    }

    const { data: hospital, error } = await supabase
      .from("hospitals")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!hospital) throw new NotFoundError(`Hospital ${id} not found`);

    await logAdminAction(req, "hospital.update", "hospital", id, updates);

    const { api_key_hash: _hash, ...safeHospital } = hospital;

    res.json({ hospital: { ...safeHospital, has_api_key: !!hospital.api_key_hash } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/hospitals/:id/rotate-key — rotate hospital sync API key
// ---------------------------------------------------------------------------
adminRoutes.post(
  "/admin/hospitals/:id/rotate-key",
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const supabase = getSupabase();

      const { data: existing, error: fetchError } = await supabase
        .from("hospitals")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!existing) throw new NotFoundError(`Hospital ${id} not found`);

      const apiKey = generateHospitalApiKey();
      const api_key_hash = hashHospitalApiKey(apiKey);

      const { error: updateError } = await supabase
        .from("hospitals")
        .update({ api_key_hash })
        .eq("id", id);

      if (updateError) throw updateError;

      await logAdminAction(req, "key.rotate", "hospital", id);

      res.json({ api_key: apiKey });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /admin/hospitals/:id/modules — add an app module
// ---------------------------------------------------------------------------
adminRoutes.post("/admin/hospitals/:id/modules", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;
    const { app_module } = req.body as { app_module: string };

    if (!app_module) {
      return res.status(400).json({ error: "app_module is required" });
    }

    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("hospital_app_modules")
      .select("id, disabled_at")
      .eq("hospital_id", hospitalId)
      .eq("app_module", app_module)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("hospital_app_modules")
        .update({ disabled_at: null })
        .eq("id", existing.id);
    } else {
      const { error } = await supabase
        .from("hospital_app_modules")
        .insert({ hospital_id: hospitalId, app_module });
      if (error) throw error;
    }

    await deriveSubscriptionsForHospital(hospitalId);

    const { data: subscriptions } = await supabase
      .from("hospital_module_subscriptions")
      .select("collection_id, pinned_version")
      .eq("hospital_id", hospitalId);

    await logAdminAction(req, "module.add", "hospital", hospitalId, {
      app_module,
    });

    res.status(201).json({ app_module, subscriptions: subscriptions ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/hospitals/:id/modules/:module — disable a module
// ---------------------------------------------------------------------------
adminRoutes.delete(
  "/admin/hospitals/:id/modules/:module",
  async (req, res, next) => {
    try {
      const { id: hospitalId, module: app_module } = req.params;
      const supabase = getSupabase();

      const { error } = await supabase
        .from("hospital_app_modules")
        .update({ disabled_at: new Date().toISOString() })
        .eq("hospital_id", hospitalId)
        .eq("app_module", app_module)
        .is("disabled_at", null);

      if (error) throw error;

      await logAdminAction(req, "module.remove", "hospital", hospitalId, {
        app_module,
      });

      res.json({ ok: true, app_module, disabled: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /admin/hospitals/:id/upgrade — trigger a collection version upgrade
// ---------------------------------------------------------------------------
adminRoutes.post("/admin/hospitals/:id/upgrade", async (req, res, next) => {
  try {
    const { id: hospitalId } = req.params;
    const { collectionId, toVersion, triggeredBy } = req.body as {
      collectionId: string;
      toVersion: string;
      triggeredBy?: string;
    };

    if (!collectionId || !toVersion) {
      return res
        .status(400)
        .json({ error: "collectionId and toVersion are required" });
    }

    const actor = req.user?.email ?? "admin";
    const result = await triggerCollectionUpgrade(
      hospitalId,
      collectionId,
      toVersion,
      triggeredBy ?? actor,
    );

    const isRollback =
      result.fromVersion != null &&
      compareVersionStrings(result.toVersion, result.fromVersion) < 0;

    await logAdminAction(
      req,
      isRollback ? "upgrade.rollback" : "upgrade.trigger",
      "rollout",
      String(result.rolloutId),
      {
        hospitalId,
        collectionId,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
      },
    );

    res.status(201).json({
      rolloutId: result.rolloutId,
      fromVersion: result.fromVersion,
      toVersion: result.toVersion,
      changedCount: result.changedCount,
      retiredCount: result.retiredCount,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/hospitals/:id/upgrade-all — upgrade every subscription to next version
// ---------------------------------------------------------------------------
adminRoutes.post(
  "/admin/hospitals/:id/upgrade-all",
  async (req, res, next) => {
    try {
      const { id: hospitalId } = req.params;
      const { triggeredBy } = (req.body ?? {}) as { triggeredBy?: string };
      const actor = req.user?.email ?? "admin";

      const { upgrades, skipped } = await triggerNextUpgradesForHospital(
        hospitalId,
        triggeredBy ?? actor,
      );

      for (const upgrade of upgrades) {
        await logAdminAction(req, "upgrade.trigger", "rollout", String(upgrade.rolloutId), {
          hospitalId,
          collectionId: upgrade.collectionId,
          fromVersion: upgrade.fromVersion,
          toVersion: upgrade.toVersion,
          bulk: true,
        });
      }

      res.status(201).json({ upgrades, skipped });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/hospitals/:id/reports — list upgrade reports
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/hospitals/:id/reports", async (req, res, next) => {
  try {
    const reports = await listUpgradeReports(req.params.id);
    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/hospitals/:id/reports/:rolloutId — narrative upgrade report
// ---------------------------------------------------------------------------
adminRoutes.get(
  "/admin/hospitals/:id/reports/:rolloutId",
  async (req, res, next) => {
    try {
      const rolloutId = Number(req.params.rolloutId);
      if (!Number.isFinite(rolloutId)) {
        return res.status(400).json({ error: "Invalid rolloutId" });
      }

      const report = await getOrGenerateNarrativeReport(
        req.params.id,
        rolloutId,
      );
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/hospitals/:id/sync-log — recent sync events
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/hospitals/:id/sync-log", async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("sync_log")
      .select("id, event_type, detail, created_at")
      .eq("hospital_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ sync_log: data ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/collections/:id/versions — released versions for a collection
// ---------------------------------------------------------------------------
adminRoutes.get(
  "/admin/collections/:id/versions",
  async (req, res, next) => {
    try {
      const versions = await listCollectionVersions(req.params.id);
      res.json({ collectionId: req.params.id, versions });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/collections — list all collections with latest versions
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/collections", async (_req, res, next) => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("collections")
      .select("id, app_module, is_core, is_optional_addon, latest_version, created_at")
      .order("is_core", { ascending: false });

    if (error) throw error;

    const withLabel = (data ?? []).map((c) => ({
      ...c,
      label: labelForCollection(c.id),
    }));

    res.json({ collections: withLabel });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/packaging/status — collection versions + OCL export readiness
// ---------------------------------------------------------------------------
adminRoutes.get("/admin/packaging/status", async (_req, res, next) => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("collections")
      .select("id, app_module, is_core, is_optional_addon, latest_version, created_at")
      .order("is_core", { ascending: false });

    if (error) throw error;

    const collections = await Promise.all(
      (data ?? []).map(async (c) => {
        const label = labelForCollection(c.id);

        const export_ready = c.latest_version
          ? await checkExportReady(env.OCL_ORG, c.id, c.latest_version)
          : false;

        return {
          id: c.id,
          label,
          app_module: c.app_module,
          is_core: c.is_core,
          latest_version: c.latest_version,
          export_ready,
        };
      }),
    );

    const allReady =
      collections.length > 0 &&
      collections.every((c) => !c.latest_version || c.export_ready);

    res.json({
      org: env.OCL_ORG,
      all_exports_ready: allReady,
      collections,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

function compareVersionStrings(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((p) => Number.parseInt(p, 10) || 0);
  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
