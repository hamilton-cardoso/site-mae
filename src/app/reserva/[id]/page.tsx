import Link from "next/link";
import { notFound } from "next/navigation";
import { ReservationView } from "@/components/GuestForms";
import { reservationTicket } from "@/server/gifts";
import { RequestError } from "@/server/http";
import { loadRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  await loadRuntimeConfig();
  const { id } = await params;
  let ticket;
  try {
    ticket = await reservationTicket(id);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) notFound();
    throw error;
  }
  return (
    <section className="max-w-lg mx-auto px-4 py-12 space-y-4">
      <h1 className="font-serif text-3xl font-bold">{ticket.giftName}</h1>
      <div className="bg-white border border-sage-200 rounded-3xl p-5"><ReservationView initial={ticket} standalone /></div>
      <Link className="text-sm font-semibold underline" href="/">Voltar à lista</Link>
    </section>
  );
}
