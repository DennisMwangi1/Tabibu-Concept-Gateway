import { motion } from "framer-motion";
import {
  Activity,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  Stethoscope,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/hospitals", icon: Building2, label: "Hospitals", end: false },
];

export default function Layout() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const breadcrumb = () => {
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "Dashboard";
    if (segments[0] === "hospitals") {
      if (segments[1] === "new") return "Hospitals / Register";
      if (segments[1]) return "Hospitals / Detail";
      return "Hospitals";
    }
    return segments[0];
  };

  return (
    <div className="flex min-h-[100dvh]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-sidebar-bg">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-text-active leading-tight">
              Tabibu
            </p>
            <p className="text-[11px] text-sidebar-text leading-tight">
              Admin Console
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 scrollbar-thin">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-hover text-sidebar-text-active"
                      : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isActive && (
                    <ChevronRight className="h-3 w-3 text-sidebar-text" />
                  )}
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
          {user?.email && (
            <p className="text-[11px] text-sidebar-text truncate" title={user.email}>
              {user.email}
            </p>
          )}
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
          <div className="flex items-center gap-2 text-[11px] text-sidebar-text">
            <Activity className="h-3 w-3 text-brand-500" />
            <span>Gateway</span>
            <span className="ml-auto flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
              Live
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-8 py-4 flex items-center gap-2">
          <span className="text-sm text-slate-500">Tabibu</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-sm font-medium text-slate-900 capitalize">
            {breadcrumb()}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 px-8 py-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

// Unused but exported for future settings nav
export { Settings };
