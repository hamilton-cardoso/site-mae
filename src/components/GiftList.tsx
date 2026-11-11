"use client";

import { Calendar, Gift as GiftIcon, MapPin, Search, Sparkles, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, EVENT_INFO, RESERVATION_HOURS, type Gift, type GiftAction, type GiftCategory } from "@/data/gifts";
import { FreeDonationSection } from "./FreeDonationSection";
import { GiftActionModal } from "./GiftActionModal";
import { GiftCard } from "./GiftCard";

const GIFTS_PER_PAGE = 15;

export function GiftList({ gifts, sandbox, cardEnabled }: { gifts: Gift[]; sandbox: boolean; cardEnabled: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState<GiftCategory | "Todos">("Todos");
  const [status, setStatus] = useState("Todos");
  const [query, setQuery] = useState("");
  const [priceOrder, setPriceOrder] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{ gift: Gift; method: GiftAction } | null>(null);
  const resultsRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const filtered = gifts.filter((gift) => (
    (category === "Todos" || category === gift.category) &&
    (status === "Todos" ||
      (status === "Disponíveis" && (gift.canPay || gift.canReserve)) ||
      (status === "Concluídos" && ["funded", "purchased", "received"].includes(gift.status))) &&
    (gift.name + " " + gift.description).toLowerCase().includes(query.trim().toLowerCase())
  ));
  if (priceOrder) {
    filtered.sort((a, b) => priceOrder === "asc" ? a.priceCents - b.priceCents : b.priceCents - a.priceCents);
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / GIFTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const firstGift = (currentPage - 1) * GIFTS_PER_PAGE;
  const visibleGifts = filtered.slice(firstGift, firstGift + GIFTS_PER_PAGE);

  function goToPage(nextPage: number) {
    setPage(nextPage);
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="space-y-14">
      <section className="bg-gradient-to-b from-cream-100 via-cream-50 to-cream-50 border-b border-sage-200/70">
        {sandbox && <p className="bg-amber-100 text-amber-900 text-center py-2 text-xs font-semibold">Ambiente de teste. Os pagamentos são simulados.</p>}
        <div className="max-w-3xl mx-auto text-center px-4 py-12 sm:py-16 space-y-6">
          <p className="inline-flex items-center gap-2 bg-terracotta-100 text-terracotta-800 border border-terracotta-200 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold">
            <Sparkles className="w-4 h-4" /> Bem-vindos ao nosso chá de cozinha!
          </p>
          <h1 className="text-4xl sm:text-6xl font-serif font-bold text-sage-900 tracking-tight">{EVENT_INFO.title}</h1>
          <p className="text-sage-700 leading-relaxed max-w-xl mx-auto">{EVENT_INFO.subtitle}</p>
          <div className="flex flex-wrap gap-3 justify-center text-xs sm:text-sm text-sage-800">
            <span className="inline-flex items-center gap-2"><Calendar className="w-4 h-4 text-terracotta-600" />{EVENT_INFO.date}</span>
            <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4 text-terracotta-600" />{EVENT_INFO.location}</span>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="#lista-presentes" className="btn-primary"><GiftIcon size={18} /> Escolher presente</a>
            <a href="#doar-dinheiro" className="btn-secondary"><Wallet size={18} /> Fazer uma doação</a>
          </div>
        </div>
      </section>
      <section id="lista-presentes" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 space-y-5">
        <div className="flex flex-wrap gap-4 justify-between items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-terracotta-700">Sugestões para a cozinha nova</p>
            <h2 className="text-3xl font-serif font-bold text-sage-900 mt-1">Lista de presentes</h2>
            <p className="text-sm text-sage-700 mt-2">Contribua com Pix{cardEnabled && " ou cartão"} ou reserve um item por {RESERVATION_HOURS} horas para comprar em uma das lojas indicadas.</p>
          </div>
          {gifts.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <label className="relative">
                <Search className="absolute left-3 top-3.5 w-4 h-4 text-sage-600" />
                <input className="field pl-9" aria-label="Buscar presente" placeholder="Buscar presente" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
              </label>
              <select className="field w-auto" aria-label="Disponibilidade" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option>Todos</option><option>Disponíveis</option><option>Concluídos</option>
              </select>
              <select className="field w-auto" aria-label="Ordenar por valor" value={priceOrder} onChange={(e) => { setPriceOrder(e.target.value); setPage(1); }}>
                <option value="">Ordenar por valor</option>
                <option value="asc">Menor valor primeiro</option>
                <option value="desc">Maior valor primeiro</option>
              </select>
            </div>
          )}
        </div>
        {gifts.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Categorias">
            {(["Todos", ...CATEGORIES] as const).map((option) => (
              <button key={option} type="button" aria-pressed={category === option} onClick={() => { setCategory(option); setPage(1); }}
                className={"rounded-full px-4 py-2 text-xs font-semibold border " + (category === option ? "bg-sage-800 text-white" : "bg-white border-sage-200")}>
                {option}
              </button>
            ))}
          </div>
        )}
        {filtered.length ? (
          <>
            {pageCount > 1 && (
              <p ref={resultsRef} tabIndex={-1} aria-live="polite" className="scroll-mt-24 text-sm text-sage-700">
                Mostrando {firstGift + 1} a {firstGift + visibleGifts.length} de {filtered.length} presentes
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleGifts.map((gift) => <GiftCard key={gift.id} gift={gift} cardEnabled={cardEnabled} onSelect={(method) => setSelection({ gift, method })} />)}
            </div>
            {pageCount > 1 && (
              <nav aria-label="Paginação da lista de presentes" className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="btn-secondary" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
                  Anterior
                </button>
                <span className="text-sm text-sage-700">Página {currentPage} de {pageCount}</span>
                <button type="button" className="btn-secondary" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>
                  Próxima
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="rounded-3xl border border-sage-200 bg-white p-10 text-center">
            <GiftIcon className="mx-auto mb-3 text-sage-500" />
            <p className="font-serif text-lg font-bold">{gifts.length ? "Nenhum presente encontrado" : "A lista de presentes está sendo preparada"}</p>
          </div>
        )}
      </section>
      <FreeDonationSection cardEnabled={cardEnabled} />
      {selection && <GiftActionModal {...selection} onClose={() => { setSelection(null); router.refresh(); }} />}
    </div>
  );
}
