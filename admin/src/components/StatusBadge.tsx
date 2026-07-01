interface Props {
  active: boolean;
  labels?: { active?: string; inactive?: string };
}

export default function StatusBadge({
  active,
  labels = { active: "Active", inactive: "Inactive" },
}: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
        active
          ? "bg-brand-50 text-brand-700 ring-brand-200"
          : "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brand-500" : "bg-slate-400"}`}
      />
      {active ? labels.active : labels.inactive}
    </span>
  );
}
