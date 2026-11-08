import Link from "next/link";
import { notFound } from "next/navigation";
import { PixView } from "@/components/GuestForms";
import { pixPage } from "@/server/payments";
import { loadRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PixPage({ params }: { params: Promise<{ id: string }> }) {
  await loadRuntimeConfig();
  const ticket = await pixPage((await params).id);
  if (!ticket) notFound();
  return (
    <section className="max-w-md mx-auto px-4 py-12 space-y-4">
      <h1 className="font-serif text-3xl font-bold">Acompanhar seu Pix</h1>
      <div className="bg-white border border-sage-200 rounded-3xl p-5"><PixView initial={ticket} standalone /></div>
      <Link className="text-sm font-semibold underline" href="/">Voltar à lista</Link>
    </section>
  );
}
