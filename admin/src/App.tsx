import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import HospitalDetail from "./pages/HospitalDetail";
import HospitalList from "./pages/HospitalList";
import RegisterHospital from "./pages/RegisterHospital";

export default function App() {
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
