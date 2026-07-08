import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  GitBranch,
  KeyRound,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import ModuleChip from "../components/ModuleChip";
import StatusBadge from "../components/StatusBadge";
import SubscriptionVersionRow from "../components/SubscriptionVersionRow";
import SyncLogTable from "../components/SyncLogTable";
import UpgradeAllButton from "../components/UpgradeAllButton";
import UpgradeReportsTable from "../components/UpgradeReportsTable";
import { api } from "../lib/api";
import { useModuleCatalog } from "../hooks/useModuleCatalog";

export default function HospitalDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [addingModule, setAddingModule] = useState(false);
  const [selectedModule, setSelectedModule] = useState("");
  const { data: catalog } = useModuleCatalog();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["hospital", id],
    queryFn: () => api.hospitals.get(id!),
    enabled: !!id,
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["reports", id],
    queryFn: () => api.hospitals.reports(id!),
    enabled: !!id,
  });

  const toggleActive = useMutation({
    mutationFn: (is_active: boolean) =>
      api.hospitals.update(id!, { is_active }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["hospital", id] }),
  });

  const addModule = useMutation({
    mutationFn: (app_module: string) =>
      api.hospitals.addModule(id!, app_module),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital", id] });
      setAddingModule(false);
      setSelectedModule("");
    },
  });

  const removeModule = useMutation({
    mutationFn: (app_module: string) =>
      api.hospitals.removeModule(id!, app_module),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["hospital", id] }),
  });

  const rotateKey = useMutation({
    mutationFn: () => api.hospitals.rotateKey(id!),
  });

  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-2xl bg-slate-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Hospital not found</p>
        <Link
          to="/hospitals"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to hospitals
        </Link>
      </div>
    );
  }

  const { hospital, modules, subscriptions, recent_sync_log } = data;
  const activeModules = modules.filter((m) => !m.disabled_at);
  const activeModuleIds = new Set(activeModules.map((m) => m.app_module));
  const availableToAdd = (catalog?.modules ?? []).filter(
    (m) => !activeModuleIds.has(m.app_module),
  );

  return (
    <div className="space-y-8">
      {/* Back + header */}
      <div>
        <Link
          to="/hospitals"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          All hospitals
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {hospital.name}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {hospital.kmhfl_code ?? "No KMHFL code"} · ID: {hospital.id}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge active={hospital.is_active} />
            <button
              onClick={() => toggleActive.mutate(!hospital.is_active)}
              disabled={toggleActive.isPending}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {hospital.is_active ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <UpgradeAllButton
              hospitalId={hospital.id}
              hospitalName={hospital.name}
              subscriptions={subscriptions}
            />
          </div>
        </div>
      </div>

      {/* Sync API key */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-500" />
              Hospital Sync API Key
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Used by the on-site Go sync client.{" "}
              {hospital.has_api_key
                ? "A key is configured."
                : "No key configured yet."}
            </p>
          </div>
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Rotate the API key? The old key stops working immediately.",
                )
              ) {
                rotateKey.mutate(undefined, {
                  onSuccess: (res) => {
                    setRotatedKey(res.api_key);
                    queryClient.invalidateQueries({ queryKey: ["hospital", id] });
                  },
                });
              }
            }}
            disabled={rotateKey.isPending}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {rotateKey.isPending ? "Rotating…" : "Rotate key"}
          </button>
        </div>

        {rotatedKey && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="text-xs text-amber-800 font-medium">
              New key — copy now, it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-mono break-all">
                {rotatedKey}
              </code>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(rotatedKey);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900"
              >
                <Copy className="h-3.5 w-3.5" />
                {keyCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Modules panel */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              App Modules
            </h2>
            <span className="text-xs text-slate-400">
              {activeModules.length} active
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {activeModules.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">
                No modules provisioned
              </p>
            ) : (
              activeModules.map((m) => (
                <div
                  key={m.app_module}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <ModuleChip module={m.app_module} />
                  <button
                    onClick={() => removeModule.mutate(m.app_module)}
                    disabled={removeModule.isPending}
                    className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Remove module"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add module */}
          <div className="border-t border-slate-100 px-5 py-4">
            {addingModule ? (
              <div className="space-y-2">
                <select
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Select module…</option>
                  {availableToAdd.map((m) => (
                    <option key={m.app_module} value={m.app_module}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAddingModule(false);
                      setSelectedModule("");
                    }}
                    className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      selectedModule && addModule.mutate(selectedModule)
                    }
                    disabled={!selectedModule || addModule.isPending}
                    className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {addModule.isPending ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingModule(true)}
                disabled={availableToAdd.length === 0}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                Add Module
              </button>
            )}
          </div>
        </motion.div>

        {/* Subscriptions panel */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              OCL Collection Versions
            </h2>
            <GitBranch className="h-4 w-4 text-slate-400" />
          </div>

          {subscriptions.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-400 text-center">
              No subscriptions yet — add a module to derive collections
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {subscriptions.map((s) => (
                <SubscriptionVersionRow
                  key={s.collection_id}
                  hospitalId={hospital.id}
                  subscription={s}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Upgrade reports */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Upgrade Reports
        </h2>
        <UpgradeReportsTable
          hospitalId={hospital.id}
          reports={reportsData?.reports ?? []}
          isLoading={reportsLoading}
        />
      </motion.div>

      {/* Sync log */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Recent Sync Activity
        </h2>
        <SyncLogTable events={recent_sync_log} />
      </motion.div>
    </div>
  );
}
