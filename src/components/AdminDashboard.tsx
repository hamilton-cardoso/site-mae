"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Download, Gift as GiftIcon, Lock, LogOut, Plus } from "lucide-react";
import { api, errorText } from "@/data/client";
import { brl, CATEGORIES, formatDate, parseAmount, STORES, type AdminPayment, type AdminReservation, type Gift } from "@/data/gifts";

const paymentLabels = {
  creating: "Preparando pagamento", pending: "Aguardando pagamento", received: "Recebido",
  expired: "Expirado", failed: "Falhou", refunded: "Estornado", review: "Revisar no Asaas",
};

const paymentMethod = (payment: AdminPayment) => payment.manual ? "Doação manual" : payment.method === "card" ? "Cartão" : "Pix";

const paymentStatus = (payment: AdminPayment) =>
  payment.method === "card" && payment.status === "received" ? "Aprovado no cartão" : paymentLabels[payment.status];

const reservationLabels = {
  reserved: "Reservado", purchased: "Compra informada", received: "Presente recebido",
  cancelled: "Cancelada", expired: "Expirada",
};

export function AdminLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      await api("/api/admin/session", "POST", { password: form.get("password") });
      router.refresh();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  return (
    <section className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-sage-200 rounded-3xl p-6 space-y-4">
        <Lock className="text-terracotta-600" />
        <h1 className="font-serif text-3xl font-bold">Painel da Juscélia</h1>
        <p className="text-sm text-sage-700">Entre para gerenciar os presentes e acompanhar os recebimentos.</p>
        <form onSubmit={signIn} className="space-y-3">
          <label className="field-label">Senha do painel<input className="field" name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
          <button className="btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        </form>
      </div>
    </section>
  );
}

function GiftEditor({ gift, onSaved, onCancel }: { gift?: Gift; onSaved: () => void; onCancel: () => void }) {
  const [pixEnabled, setPixEnabled] = useState(gift?.pixEnabled ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const quota = String(fields.get("quota") || "");
    setBusy(true);
    setError("");
    try {
      await api("/api/admin", "POST", {
        action: "saveGift", id: gift?.id, name: fields.get("name"), category: fields.get("category"),
        description: fields.get("description"), imageUrl: fields.get("imageUrl"), storeUrl: fields.get("storeUrl"),
        mercadoLivreUrl: fields.get("mercadoLivreUrl"), websiteUrl: fields.get("websiteUrl"),
        priceCents: parseAmount(String(fields.get("price") || "")),
        quantity: Number(fields.get("quantity")),
        quotaCents: quota ? parseAmount(quota) : null, pixEnabled,
      });
      onSaved();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-sage-200 bg-white p-5 space-y-4">
      <h2 className="font-serif text-xl font-bold">{gift ? "Editar presente" : "Cadastrar presente"}</h2>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
        <label className="field-label">Nome<input className="field" name="name" required maxLength={100} defaultValue={gift?.name} /></label>
        <label className="field-label">Categoria
          <select name="category" className="field" defaultValue={gift?.category || CATEGORIES[0]}>
            {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="field-label sm:col-span-2">Descrição<textarea className="field" name="description" rows={2} maxLength={600} defaultValue={gift?.description} /></label>
        <label className="field-label">Link da foto (opcional)<input className="field" name="imageUrl" type="url" maxLength={2048} defaultValue={gift?.imageUrl ?? ""} /></label>
        <label className="field-label">Link da Shopee (opcional)<input className="field" name="storeUrl" type="url" maxLength={2048} defaultValue={gift?.storeUrl ?? ""} /></label>
        <label className="field-label">Link do Mercado Livre (opcional)<input className="field" name="mercadoLivreUrl" type="url" maxLength={2048} defaultValue={gift?.mercadoLivreUrl ?? ""} /></label>
        <label className="field-label">Link do site da loja (opcional)<input className="field" name="websiteUrl" type="url" maxLength={2048} defaultValue={gift?.websiteUrl ?? ""} /></label>
        <label className="field-label">Valor por unidade em reais<input className="field" name="price" type="number" required step="0.01" min="0.01" max="10000" defaultValue={gift ? gift.priceCents / 100 : undefined} /></label>
        <label className="field-label">Quantidade<input className="field" name="quantity" type="number" required step="1" min="1" max="2147483647" defaultValue={gift?.quantity ?? 1} /></label>
        {pixEnabled && <label className="field-label">Valor sugerido da cota (opcional)<input className="field" name="quota" type="number" step="0.01" min="0.01" max="10000" defaultValue={gift?.quotaCents ? gift.quotaCents / 100 : undefined} /></label>}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={pixEnabled} onChange={(event) => setPixEnabled(event.target.checked)} /> Aceitar contribuições em dinheiro para este item</label>
      </fieldset>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar presente"}</button>
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
  );
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function exportCsv(payments: AdminPayment[], reservations: AdminReservation[]) {
  const rows = [
    ["Data", "Tipo", "Status", "Convidado", "Presente", "Valor (R$)", "Recado", "Referência Asaas"],
    ...payments.map((payment) => [
      formatDate(payment.createdAt), paymentMethod(payment),
      paymentStatus(payment), payment.guestName, payment.giftName || "", (payment.amountCents / 100).toFixed(2).replace(".", ","),
      payment.message, payment.checkoutId || payment.providerPaymentId || "",
    ]),
    ...reservations.map((reservation) => [
      formatDate(reservation.createdAt), STORES[reservation.store].label, reservationLabels[reservation.status], reservation.guestName,
      reservation.giftName, "", reservation.message, "",
    ]),
  ];
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cha-da-juscelia.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sections = ["Presentes", "Pagamentos e doações", "Reservas", "Recados"] as const;
type Section = typeof sections[number];

function AdminMessages({ payments, reservations }: { payments: AdminPayment[]; reservations: AdminReservation[] }) {
  const messages = [
    ...payments.map((payment) => ({
      ...payment,
      key: "payment-" + payment.id,
      source: paymentMethod(payment),
      statusLabel: paymentStatus(payment),
    })),
    ...reservations.map((reservation) => ({
      ...reservation,
      key: "reservation-" + reservation.id,
      source: STORES[reservation.store].label,
      statusLabel: reservationLabels[reservation.status],
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl font-bold">Recados para a Juscélia</h2>
      {messages.length === 0 && <p className="text-sm text-sage-700">Ainda não há recados.</p>}
      {messages.map(({ key, guestName, giftName, message, source, statusLabel, createdAt }) => (
        <article key={key} className="bg-white border border-sage-200 rounded-2xl p-4 space-y-1">
          <h3 className="font-bold">{guestName}</h3>
          <p className="text-sm text-sage-700">{[source, giftName, statusLabel, formatDate(createdAt)].filter(Boolean).join(" · ")}</p>
          <p className="text-sm whitespace-pre-wrap break-words">{message}</p>
        </article>
      ))}
    </div>
  );
}

export function AdminDashboard({ environment, gifts, payments, reservations }: {
  environment: "sandbox" | "production";
  gifts: Gift[];
  payments: AdminPayment[];
  reservations: AdminReservation[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("Presentes");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState(false);

  const paymentMessages = payments.filter(({ message }) => message.trim());
  const reservationMessages = reservations.filter(({ message }) => message.trim());
  const sectionCounts: Record<Section, number> = {
    Presentes: gifts.length,
    "Pagamentos e doações": payments.length,
    Reservas: reservations.length,
    Recados: paymentMessages.length + reservationMessages.length,
  };
  const confirmed = payments.filter((payment) => payment.status === "received");
  const pixTotal = confirmed.filter((payment) => !payment.manual && payment.method === "pix").reduce((total, payment) => total + payment.amountCents, 0);
  const cardTotal = confirmed.filter((payment) => payment.method === "card").reduce((total, payment) => total + payment.amountCents, 0);
  const manualTotal = confirmed.filter((payment) => payment.manual).reduce((total, payment) => total + payment.amountCents, 0);
  const receivedGifts = reservations.filter((reservation) => reservation.status === "received").length;
  const selectedGift = gifts.find((gift) => gift.id === editing);
  const search = filter.trim().toLowerCase();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy && !editing && !manual) router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [router, busy, editing, manual]);

  async function run(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try { await work(); after?.(); router.refresh(); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  function action(body: object) {
    return run(() => api("/api/admin", "POST", body));
  }

  function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() => api("/api/admin", "POST", {
      action: "manualDonation", guestName: form.get("guestName"), message: form.get("message"),
      amountCents: parseAmount(String(form.get("amount") || "")),
    }), () => setManual(false));
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-9 space-y-6">
      <header className="flex flex-wrap gap-3 justify-between items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-700">{environment === "sandbox" ? "Ambiente de teste" : "Ambiente oficial"}</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold">Painel da Juscélia</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => exportCsv(payments, reservations)}><Download size={16} /> Exportar CSV</button>
          <button className="btn-secondary" disabled={busy} onClick={() => run(() => api("/api/admin/session", "DELETE"))}><LogOut size={16} /> Sair</button>
        </div>
      </header>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Pix confirmado", brl(pixTotal)],
          ["Cartão aprovado (valor bruto)", brl(cardTotal)],
          ["Doações lançadas à mão", brl(manualTotal)],
          ["Presentes recebidos de lojas", receivedGifts],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-sage-200 rounded-2xl p-4">
            <p className="text-sm text-sage-700">{label}</p><p className="font-serif text-2xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-sage-200 pb-3" aria-label="Seções do painel">
        {sections.map((label) => {
          const count = sectionCounts[label];
          const selected = section === label;
          return (
            <button key={label} aria-pressed={selected} className={selected ? "btn-primary" : "btn-secondary"}
              aria-label={`${label}, ${count} ${count === 1 ? "registro" : "registros"}`}
              onClick={() => { setSection(label); setError(""); setFilter(""); }}>
              {label}
              <span className={`min-w-6 rounded-full px-2 py-0.5 text-xs tabular-nums ${selected ? "bg-white/20" : "bg-sage-100 text-sage-800"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </nav>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}

      {section === "Presentes" && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold">Presentes cadastrados</h2>
          <button className="btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Cadastrar presente</button>
        </div>
        {editing && <GiftEditor key={editing} gift={selectedGift} onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }} />}
        {gifts.length === 0 && <div className="bg-white rounded-2xl border border-sage-200 p-5 flex gap-2 items-center"><GiftIcon size={18} /> Cadastre o primeiro presente para publicar na lista.</div>}
        <div className="space-y-2">
          {gifts.map((gift) => (
            <article key={gift.id} className="bg-white border border-sage-200 rounded-2xl p-4 flex flex-wrap justify-between gap-3">
              <div><h3 className="font-bold">{gift.name}</h3>
                <p className="text-sm text-sage-700">{gift.category} · {gift.quantity} {gift.quantity === 1 ? "unidade" : "unidades"} · {brl(gift.priceCents)} por unidade {gift.archived && "· Arquivado"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => setEditing(gift.id)}>Editar</button>
                <button className="btn-secondary" disabled={busy} onClick={() => action({ action: "archiveGift", id: gift.id, archived: !gift.archived })}>
                  {gift.archived ? "Restaurar" : "Arquivar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>}

      {section === "Pagamentos e doações" && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold">Pagamentos e doações</h2>
          <button className="btn-secondary" onClick={() => setManual(!manual)}>{manual ? "Fechar lançamento" : "Lançar doação manual"}</button>
        </div>
        {manual && <form onSubmit={saveManual} className="bg-white border border-sage-200 rounded-2xl p-4 space-y-3">
          <label className="field-label">Nome<input className="field" name="guestName" maxLength={100} required /></label>
          <label className="field-label">Valor recebido em reais<input className="field" name="amount" type="number" min="0.01" max="10000" step="0.01" required /></label>
          <label className="field-label">Recado (opcional)<textarea className="field" name="message" maxLength={500} rows={2} /></label>
          <button className="btn-primary" disabled={busy}>Registrar doação</button>
        </form>}
        <input aria-label="Buscar por nome ou presente" placeholder="Buscar por nome ou presente" className="field max-w-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {payments.length === 0 && <p className="text-sm text-sage-700">Nenhuma contribuição registrada.</p>}
        {payments.filter((payment) => (payment.guestName + " " + (payment.giftName || "")).toLowerCase().includes(search)).map((payment) => (
          <article key={payment.id} className="bg-white border border-sage-200 rounded-2xl p-4 flex flex-wrap justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-bold">{payment.guestName} · {brl(payment.amountCents)}</h3>
              <p className="text-sm text-sage-700">{paymentMethod(payment)} · {payment.giftName || "Doação livre"} · {paymentStatus(payment)} · {formatDate(payment.createdAt)}</p>
              {payment.message && <p className="text-sm break-all">{payment.message}</p>}
              {payment.providerPaymentId && <p className="text-xs text-sage-600">Asaas {payment.providerPaymentId}</p>}
              {payment.checkoutId && <p className="text-xs text-sage-600">Checkout Asaas {payment.checkoutId}</p>}
            </div>
            {["pending", "review"].includes(payment.status) &&
              <button className="btn-secondary self-start" disabled={busy} onClick={() => action({ action: "reconcilePayment", id: payment.id })}>Consultar Asaas</button>}
          </article>
        ))}
      </div>}

      {section === "Recados" && <AdminMessages payments={paymentMessages} reservations={reservationMessages} />}

      {section === "Reservas" && <div className="space-y-4">
        <h2 className="font-serif text-2xl font-bold">Reservas de presentes</h2>
        {reservations.length === 0 && <p className="text-sm text-sage-700">Nenhuma reserva registrada.</p>}
        {reservations.map((reservation) => (
          <article key={reservation.id} className="bg-white border border-sage-200 rounded-2xl p-4 flex flex-wrap justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-bold">{reservation.giftName}</h3>
              <p className="text-sm text-sage-700">{reservation.guestName} · {STORES[reservation.store].label} · {reservationLabels[reservation.status]}</p>
              {reservation.status === "reserved" && <p className="text-xs">Prazo até {formatDate(reservation.expiresAt)}</p>}
              {reservation.message && <p className="text-sm break-all">{reservation.message}</p>}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {reservation.status === "purchased" && <button className="btn-primary" disabled={busy}
                onClick={() => action({ action: "receiveGift", id: reservation.id })}>Marcar como recebido</button>}
              {["reserved", "purchased"].includes(reservation.status) && <button className="btn-secondary" disabled={busy}
                onClick={() => action({ action: "cancelReservation", id: reservation.id })}>Cancelar reserva</button>}
            </div>
          </article>
        ))}
      </div>}
    </section>
  );
}
