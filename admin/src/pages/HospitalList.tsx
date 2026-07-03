import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ModuleChip from "../components/ModuleChip";
import StatusBadge from "../components/StatusBadge";
import { useModuleCatalog } from "../hooks/useModuleCatalog";
import { api } from "../lib/api";
import type { HospitalSummary } from "../lib/types";

export default function HospitalList() {
  const [search, setSearch] = useState("");
  const { data: catalog } = useModuleCatalog();

  const collectionToAppModule = new Map(
    (catalog?.modules ?? []).map((m) => [m.collection_id, m.app_module]),
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["hospitals"],
    queryFn: () => api.hospitals.list(),
  });

  const hospitals: HospitalSummary[] = data?.hospitals ?? [];

  const filtered = hospitals.filter(
    (h) =>
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      (h.kmhfl_code ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Hospitals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {hospitals.length} registered
          </p>
        </div>
        <Link
          to="/hospitals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Hospital
        </Link>
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name or KMHFL code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 animate-pulse"
            >
              <div className="h-8 w-8 rounded-lg bg-slate-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-slate-100" />
                <div className="h-3 w-24 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">
            {search ? "No hospitals match your search" : "No hospitals registered yet"}
          </p>
          {!search && (
            <Link
              to="/hospitals/new"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-4 w-4" />
              Register the first hospital
            </Link>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Hospital
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Modules
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide hidden xl:table-cell">
                  OCL Versions
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">
                  Last Synced
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{h.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {h.kmhfl_code ?? "No KMHFL code"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {h.active_module_count === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        h.subscriptions
                          .filter(
                            (s) =>
                              s.collection_id !== "tabibu-core" &&
                              !s.collection_id.includes("snomed"),
                          )
                          .map((s) => {
                            const appModule =
                              collectionToAppModule.get(s.collection_id);
                            if (!appModule) return null;
                            return (
                              <ModuleChip
                                key={s.collection_id}
                                module={appModule}
                                size="sm"
                              />
                            );
                          })
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden xl:table-cell">
                    <div className="space-y-1">
                      {h.subscriptions.slice(0, 2).map((s) => (
                        <div
                          key={s.collection_id}
                          className="flex items-center gap-1.5"
                        >
                          <span className="text-xs text-slate-400 truncate max-w-[100px]">
                            {s.collection_id}
                          </span>
                          <span className="text-xs font-mono text-slate-600">
                            {s.pinned_version ?? "—"}
                          </span>
                        </div>
                      ))}
                      {h.subscriptions.length > 2 && (
                        <p className="text-xs text-slate-400">
                          +{h.subscriptions.length - 2} more
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <p className="text-xs text-slate-500">
                      {h.last_synced_at
                        ? new Date(h.last_synced_at).toLocaleDateString()
                        : "Never"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge active={h.is_active} />
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      to={`/hospitals/${h.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      View
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
