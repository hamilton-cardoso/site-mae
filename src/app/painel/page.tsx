import { AdminDashboard, AdminLogin } from "@/components/AdminDashboard";
import { isAdmin } from "@/server/auth";
import { adminSnapshot } from "@/server/gifts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel da Juscélia", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) return <AdminLogin />;
  return <AdminDashboard {...await adminSnapshot()} />;
}
