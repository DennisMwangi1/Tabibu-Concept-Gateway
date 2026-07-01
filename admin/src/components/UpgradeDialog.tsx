import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import CollectionVersionSelect from "./CollectionVersionSelect";

interface Props {
  hospitalId: string;
  hospitalName: string;
}

export default function UpgradeDialog({ hospitalId, hospitalName }: Props) {
  const [open, setOpen] = useState(false);
  const [collectionId, setCollectionId] = useState("");
  const [toVersion, setToVersion] = useState("");
  const queryClient = useQueryClient();

  const { data: collectionsData } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.collections.list(),
  });

  useEffect(() => {
    setToVersion("");
  }, [collectionId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.hospitals.upgrade(hospitalId, {
        collectionId,
        toVersion,
        triggeredBy: "admin-ui",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital", hospitalId] });
      queryClient.invalidateQueries({ queryKey: ["reports", hospitalId] });
      setOpen(false);
      setCollectionId("");
      setToVersion("");
    },
  });

  const collections = collectionsData?.collections ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <ArrowRight className="h-4 w-4" />
        Trigger Upgrade
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
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
                    Trigger Collection Upgrade
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {hospitalName}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Collection
                  </label>
                  <select
                    value={collectionId}
                    onChange={(e) => setCollectionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Select a collection…</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Target version
                  </label>
                  <CollectionVersionSelect
                    collectionId={collectionId}
                    value={toVersion}
                    onChange={setToVersion}
                  />
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    This creates a rollout record and upgrade report. The hospital
                    will receive the new bundle on its next sync.
                  </p>
                </div>

                {mutation.isError && (
                  <p className="text-xs text-red-600">
                    {(mutation.error as Error).message}
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={
                    !collectionId || !toVersion || mutation.isPending
                  }
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mutation.isPending ? "Queuing…" : "Queue Upgrade"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
