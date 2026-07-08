import { Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import HospitalDetail from "./pages/HospitalDetail";
import HospitalList from "./pages/HospitalList";
import Login from "./pages/Login";
import RegisterHospital from "./pages/RegisterHospital";

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="hospitals" element={<HospitalList />} />
        <Route path="hospitals/new" element={<RegisterHospital />} />
        <Route path="hospitals/:id" element={<HospitalDetail />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoutes />
    </AuthProvider>
  );
}
