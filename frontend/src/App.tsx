import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Agenda from "@/pages/Agenda";
import MyFamily from "@/pages/MyFamily";
import Families from "@/pages/Families";
import Members from "@/pages/Members";
import Settings from "@/pages/Settings";
import Sectors from "@/pages/Sectors";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/solicitar-acesso" element={<Signup />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Agenda />} />
          <Route path="/minha-familia" element={<MyFamily />} />
          <Route path="/familias" element={<Families />} />
          <Route path="/membros" element={<Members />} />
          <Route path="/setores" element={<Sectors />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
