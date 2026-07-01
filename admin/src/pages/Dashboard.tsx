import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const { data: hospitalsData, isLoading: loadingHospitals } = useQuery({
    queryKey: ["hospitals"],
    queryFn: () => api.hospitals.list(),
  });

  const { data: collectionsData, isLoading: loadingCollections } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.collections.list(),
  });

  const {
    data: packagingData,
    isLoading: loadingPackaging,
    refetch: refetchPackaging,
    isFetching: fetchingPackaging,
  } = useQuery({
    queryKey: ["packaging-status"],
    queryFn: () => api.packaging.status(),
    refetchInterval: 60_000,
  });

  const hospitals = hospitalsData?.hospitals ?? [];
  const collections = collectionsData?.collections ?? [];
  const packagingCollections = packagingData?.collections ?? [];

  const active = hospitals.filter((h) => h.is_active).length;
  const totalModuleSlots = hospitals.reduce(
    (s, h) => s + h.active_module_count,
    0,
  );
  const recentEvents = hospitals
    .filter((h) => h.last_synced_at)
    .sort(
      (a, b) =>
        new Date(b.last_synced_at!).getTime() -
        new Date(a.last_synced_at!).getTime(),
    )
    .slice(0, 5);

  const stats = [
    {
      label: "Total Hospitals",
      value: hospitals.length,
      icon: Building2,
      color: "text-slate-700",
      bg: "bg-slate-100",
    },
    {
      label: "Active Hospitals",
      value: active,
      icon: Activity,
      color: "text-brand-700",
      bg: "bg-brand-50",
    },
    {
      label: "Module Slots",
      value: totalModuleSlots,
      icon: Database,
      color: "text-blue-700",
      bg: "bg-blue-50",
    },
    {
      label: "Collections",
      value: collections.length,
      icon: GitBranch,
      color: "text-purple-700",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Overview
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tabibu Concept Gateway — hospital management dashboard
        </p>
      </div>

      {/* Stats */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <div className={`rounded-lg ${stat.bg} p-2`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              {loadingHospitals || loadingCollections ? (
                <div className="h-8 w-16 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight text-slate-900">
                  {stat.value}
                </p>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Packaging status */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Concept Library
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                OCL org: {packagingData?.org ?? "—"}
                {packagingData?.checked_at && (
                  <>
                    {" "}
                    · checked{" "}
                    {new Date(packagingData.checked_at).toLocaleTimeString()}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {packagingData && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                    packagingData.all_exports_ready
                      ? "bg-brand-50 text-brand-700 ring-brand-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200"
                  }`}
                >
                  {packagingData.all_exports_ready ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {packagingData.all_exports_ready
                    ? "All exports ready"
                    : "Exports warming"}
                </span>
              )}
              <button
                onClick={() => refetchPackaging()}
                disabled={fetchingPackaging}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
                title="Refresh export status"
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetchingPackaging ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loadingPackaging
              ? [1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-5 py-3.5 animate-pulse">
                    <div className="h-4 w-32 rounded bg-slate-100 mb-1" />
                    <div className="h-3 w-48 rounded bg-slate-100" />
                  </div>
                ))
              : packagingCollections.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {c.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.latest_version ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          <GitBranch className="h-3 w-3" />
                          {c.latest_version}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          No release
                        </span>
                      )}
                      {c.latest_version && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                            c.export_ready
                              ? "bg-brand-50 text-brand-700 ring-brand-200"
                              : "bg-amber-50 text-amber-700 ring-amber-200"
                          }`}
                        >
                          {c.export_ready ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {c.export_ready ? "Export ready" : "Generating"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
          </div>

          <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-2 text-xs text-slate-500">
            <Terminal className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Run packaging from CLI:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                npm run packaging:run -- --version v1.x.x
              </code>
            </span>
          </div>
        </motion.div>

        {/* Recent syncs */}
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="rounded-2xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Syncs
            </h2>
            <RefreshCw className="h-4 w-4 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {loadingHospitals
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-3.5 animate-pulse">
                    <div className="h-4 w-40 rounded bg-slate-100 mb-1" />
                    <div className="h-3 w-24 rounded bg-slate-100" />
                  </div>
                ))
              : recentEvents.length === 0
                ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm text-slate-400">No syncs recorded yet</p>
                  </div>
                )
                : recentEvents.map((h) => (
                    <Link
                      key={h.id}
                      to={`/hospitals/${h.id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {h.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {h.kmhfl_code ?? "—"}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400">
                        {h.last_synced_at
                          ? new Date(h.last_synced_at).toLocaleDateString()
                          : "—"}
                      </p>
                    </Link>
                  ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
