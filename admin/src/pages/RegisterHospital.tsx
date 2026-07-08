import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, CheckCircle2, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useModuleCatalog } from "../hooks/useModuleCatalog";
import { api } from "../lib/api";

function ApiKeyReveal({
  apiKey,
  hospitalId,
  onDone,
}: {
  apiKey: string;
  hospitalId: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-amber-900">
            Save the hospital API key now
          </h2>
          <p className="text-xs text-amber-800 mt-1">
            This key authenticates the on-site sync client. It will not be shown
            again. Configure it as{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            on bundle and subscription requests.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 break-all">
          {apiKey}
        </code>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <button
        onClick={onDone}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        I've saved the key — open hospital {hospitalId.slice(0, 8)}…
      </button>
    </motion.div>
  );
}

export default function RegisterHospital() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: catalog, isLoading: catalogLoading } = useModuleCatalog();
  const [name, setName] = useState("");
  const [kmhfl_code, setKmhflCode] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [registered, setRegistered] = useState<{
    hospitalId: string;
    apiKey: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.hospitals.register({
        name,
        kmhfl_code: kmhfl_code || undefined,
        modules: selectedModules,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
      setRegistered({ hospitalId: data.hospital.id, apiKey: data.api_key });
    },
  });

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  if (registered) {
    return (
      <div className="max-w-2xl">
        <ApiKeyReveal
          apiKey={registered.apiKey}
          hospitalId={registered.hospitalId}
          onDone={() => navigate(`/hospitals/${registered.hospitalId}`)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        to="/hospitals"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to hospitals
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Register Hospital
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Creates the hospital record and provisions its concept library
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Hospital info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Hospital Information
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Hospital Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Nyabondo District Hospital"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              KMHFL Code
              <span className="ml-2 text-xs font-normal text-slate-400">
                optional
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. KE-0042"
              value={kmhfl_code}
              onChange={(e) => setKmhflCode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        {/* Module selection */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              App Modules
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>{catalog?.core.label ?? "Core"}</strong> is always
              included. Select additional modules to provision.
            </p>
          </div>

          {/* Always-on core */}
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="h-5 w-5 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-800">
                {catalog?.core.label ?? "Core"}
              </p>
              <p className="text-xs text-brand-600">
                {catalog?.core.description ??
                  "Vital signs, visit diagnoses, clinical assessment — always included"}
              </p>
            </div>
            <span className="text-xs text-brand-600 font-medium">Required</span>
          </div>

          {/* Optional modules */}
          {catalogLoading ? (
            <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ) : (
            catalog?.modules.map((m) => {
              const selected = selectedModules.includes(m.app_module);
              return (
                <motion.button
                  key={m.app_module}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => toggleModule(m.app_module)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    selected
                      ? `${m.chip_color} border-current`
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected
                        ? "bg-brand-600 border-transparent"
                        : "border-slate-300"
                    }`}
                  >
                    {selected && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${selected ? "" : "text-slate-800"}`}
                    >
                      {m.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.description}
                    </p>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        {/* Summary */}
        {(name || selectedModules.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600"
          >
            <p>
              Registering{" "}
              <strong className="text-slate-900">{name || "…"}</strong>
              {kmhfl_code && <span> ({kmhfl_code})</span>}{" "}
              with{" "}
              <strong className="text-slate-900">
                {selectedModules.length + 1}
              </strong>{" "}
              module{selectedModules.length !== 0 ? "s" : ""} (core
              {selectedModules
                .map((id) => {
                  const mod = catalog?.modules.find((m) => m.app_module === id);
                  return `, ${mod?.label ?? id}`;
                })
                .join("")}
              ).
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Collection subscriptions will be auto-derived after registration.
              An API key for the on-site sync client will be generated once.
            </p>
          </motion.div>
        )}

        {mutation.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(mutation.error as Error).message}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            to="/hospitals"
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 text-center hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Building2 className="h-4 w-4" />
            {mutation.isPending ? "Registering…" : "Register Hospital"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
