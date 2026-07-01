const MODULE_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  laboratory: {
    label: "Lab",
    color: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  },
  pharmacy: {
    label: "Pharmacy",
    color: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  },
  maternity: {
    label: "Maternity",
    color: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
  dashboard: {
    label: "Dashboard",
    color: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  },
  patients: {
    label: "Patients",
    color: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  triage: {
    label: "Triage",
    color: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  },
  "clinical-operations": {
    label: "Clinical Ops",
    color: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  },
  reports: {
    label: "Reports",
    color: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  },
  settings: {
    label: "Settings",
    color: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  },
};

interface Props {
  module: string;
  size?: "sm" | "md";
}

export default function ModuleChip({ module, size = "md" }: Props) {
  const config = MODULE_CONFIG[module] ?? {
    label: module,
    color: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.color} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {config.label}
    </span>
  );
}
