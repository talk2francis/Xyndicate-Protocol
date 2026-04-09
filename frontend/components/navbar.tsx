"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWallet } from "@/lib/wallet-context";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/arena", label: "Arena" },
  { href: "/deploy", label: "Deploy" },
  { href: "/market", label: "Market" },
  { href: "/proofs", label: "Proofs" },
  { href: "/docs", label: "Docs" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white/80 dark:border-white/10 dark:bg-xyn-dark/80">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 3H7.2L9 6.2L10.8 3H14L10.9 8.95L14.2 15H11L9 11.45L7 15H3.8L7.1 8.95L4 3Z" fill="currentColor" />
        </svg>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-xyn-muted dark:text-zinc-300">
        Xyndicate Protocol
      </span>
    </div>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const pathname = usePathname();
  const { address, connect, disconnect, isCorrectChain } = useWallet();

  const buttonLabel = useMemo(() => {
    if (!address) return "Connect Wallet";
    const compact = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return isCorrectChain ? compact : `${compact} · Wrong Chain`;
  }, [address, isCorrectChain]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all ${
        scrolled
          ? "border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-2 text-sm transition ${pathname === item.href ? "bg-xyn-gold/15 font-semibold text-xyn-dark dark:text-xyn-gold" : "text-xyn-muted hover:text-xyn-dark dark:text-zinc-300 dark:hover:text-white"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="relative">
            <button
              type="button"
              onClick={address ? () => setWalletMenuOpen((prev) => !prev) : connect}
              className="flex items-center gap-2 rounded-full bg-xyn-gold px-4 py-2 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
            >
              {buttonLabel}
              {address ? <ChevronDown className="h-4 w-4" /> : null}
            </button>

            {address && walletMenuOpen ? (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-black/10 bg-white/95 p-2 shadow-xl dark:border-white/10 dark:bg-zinc-900/95">
                <div className="px-3 py-2 text-xs text-xyn-muted dark:text-zinc-400">Connected wallet</div>
                <button
                  type="button"
                  onClick={() => {
                    disconnect();
                    setWalletMenuOpen(false);
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300"
                >
                  Disconnect wallet
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
