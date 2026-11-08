import Link from "next/link";
import { notFound } from "next/navigation";
import { CardView } from "@/components/GuestForms";
import { getCard } from "@/server/payments";
import { loadRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  await loadRuntimeConfig();
  const ticket = await getCard((await params).id, false);
  if (!ticket) notFound();
  return (
    <section className="max-w-md mx-auto px-4 py-12 space-y-4">
      <h1 className="font-serif text-3xl font-bold">Acompanhar contribuição no cartão</h1>
      <div className="bg-white border border-sage-200 rounded-3xl p-5"><CardView initial={ticket} /></div>
      <Link className="text-sm font-semibold underline" href="/">Voltar à lista</Link>
    </section>
  );
}
