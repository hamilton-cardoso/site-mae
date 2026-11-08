"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coffee, Gift, Wallet } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/painel");

  return (
    <header className="sticky top-0 z-40 bg-cream-50/90 backdrop-blur-md border-b border-sage-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="hidden sm:flex w-9 h-9 rounded-xl bg-sage-800 text-cream-50 items-center justify-center shadow-sm group-hover:bg-terracotta-600 transition">
            <Coffee className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif font-bold text-base sm:text-lg whitespace-nowrap text-sage-900 tracking-tight block leading-none">
              Chá da Juscélia
            </span>
            <span className="hidden sm:block text-[11px] text-sage-600 font-medium">
              Lista de Presentes & Doações
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {!isAdmin ? (
            <>
              <a
                href="/#lista-presentes"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-sage-700 hover:text-sage-900 px-3 py-2 rounded-xl hover:bg-sage-100/60 transition"
              >
                <Gift className="w-4 h-4 text-sage-600" />
                <span>Lista de Itens</span>
              </a>
              <a
                href="/#doar-dinheiro"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold bg-terracotta-600 hover:bg-terracotta-700 text-white px-3.5 py-2 rounded-xl shadow-sm transition"
              >
                <Wallet className="w-4 h-4" />
                <span>Doar</span>
              </a>
            </>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold bg-sage-800 hover:bg-sage-900 text-white px-4 py-2 rounded-xl shadow-sm transition"
            >
              <Gift className="w-4 h-4" />
              <span>Voltar à lista</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

