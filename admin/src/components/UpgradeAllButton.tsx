import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpCircle, X } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import type { CollectionSubscription } from "../lib/types";

interface Props {
  hospitalId: string;
  hospitalName: string;
  subscriptions: CollectionSubscription[];
}

export default function UpgradeAllButton({
  hospitalId,
  hospitalName,
  subscriptions,
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.hospitals.upgradeAll(hospitalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital", hospitalId] });
      queryClient.invalidateQueries({ queryKey: ["reports", hospitalId] });
    },
  });

  const hasSubscriptions = subscriptions.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!hasSubscriptions}
        className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowUpCircle className="h-4 w-4" />
        Upgrade All to Next
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => !mutation.isPending && setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Upgrade All Subscriptions
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">{hospitalName}</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  disabled={mutation.isPending}
                  className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Queues an upgrade to the next available version for each
                  subscribed collection ({subscriptions.length} total). Collections
                  already on the latest version are skipped.
                </p>

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Each upgrade creates a rollout and diff report. The hospital
                    receives new bundles on its next sync.
                  </p>
                </div>

                {mutation.isError && (
                  <p className="text-xs text-red-600">
                    {(mutation.error as Error).message}
                  </p>
                )}

                {mutation.isSuccess && (
                  <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2.5 text-xs text-brand-800 space-y-1">
                    <p className="font-medium">
                      {mutation.data.upgrades.length} upgrade
                      {mutation.data.upgrades.length === 1 ? "" : "s"} queued
                    </p>
                    {mutation.data.upgrades.map((u) => (
                      <p key={u.rolloutId}>
                        {u.collectionId}: {u.fromVersion ?? "none"} → {u.toVersion}
                      </p>
                    ))}
                    {mutation.data.skipped.length > 0 && (
                      <p className="text-brand-600 mt-1">
                        Skipped {mutation.data.skipped.length} (already at latest)
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setOpen(false)}
                  disabled={mutation.isPending}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {mutation.isSuccess ? "Close" : "Cancel"}
                </button>
                {!mutation.isSuccess && (
                  <button
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                    className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                  >
                    {mutation.isPending ? "Queuing…" : "Queue All Upgrades"}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
