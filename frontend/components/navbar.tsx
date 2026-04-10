"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWallet } from "@/lib/wallet-context";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/arena", label: "Arena" },
  { href: "/deploy", label: "Deploy" },
  { href: "/market", label: "Market" },
  { href: "/economy", label: "Economy" },
  { href: "/proofs", label: "Proofs" },
  { href: "/docs", label: "Docs" },
];

function Logo() {
  return (
    <div className="flex items-center">
      <Image
        src="/xyndicate-wordmark.svg"
        alt="Xyndicate Protocol"
        width={220}
        height={56}
        priority
        className="h-10 w-auto object-contain opacity-95 dark:invert"
      />
    </div>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  useEffect(() => {
    setMobileNavOpen(false);
    setWalletMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all ${
        scrolled
          ? "border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6">
        <Link href="/" className="shrink-0 pr-2">
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

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-xyn-dark transition hover:bg-black/5 md:hidden dark:border-white/10 dark:text-white dark:hover:bg-white/10"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={address ? () => setWalletMenuOpen((prev) => !prev) : connect}
              className="flex max-w-[152px] items-center gap-2 rounded-full bg-xyn-gold px-3 py-2 text-sm font-semibold text-xyn-dark transition hover:opacity-90 sm:max-w-none sm:px-4"
            >
              <span className="truncate">{buttonLabel}</span>
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

      {mobileNavOpen ? (
        <div className="border-t border-black/10 bg-background/95 px-4 py-4 backdrop-blur md:hidden dark:border-white/10">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-4 py-3 text-sm transition ${pathname === item.href ? "bg-xyn-gold/15 font-semibold text-xyn-dark dark:text-xyn-gold" : "text-xyn-muted hover:bg-black/5 hover:text-xyn-dark dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
