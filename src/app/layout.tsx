import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chá de Cozinha da Juscélia | Lista de Presentes",
  description: "Escolha um presente ou contribua com uma cota para o chá de cozinha da Juscélia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex flex-col antialiased selection:bg-terracotta-200">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="bg-cream-100 border-t border-sage-200 py-8 mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap justify-between gap-4 text-xs text-sage-700">
            <p>Feito com carinho para o <strong>Chá de Cozinha da Juscélia</strong></p>
            <Link href="/painel" className="underline underline-offset-4 font-semibold">Painel da Juscélia</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
