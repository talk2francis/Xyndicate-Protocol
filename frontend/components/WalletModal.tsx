"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
      on?: (event: string, listener: (...args: any[]) => void) => void;
      removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    };
  }
}

const WALLET_OPTIONS = [
  { id: "okx", name: "OKX Wallet", recommended: true },
  { id: "metamask", name: "MetaMask" },
  { id: "rabby", name: "Rabby" },
  { id: "zerion", name: "Zerion" },
];

const XLAYER_CHAIN_ID_DECIMAL = 196;
const XLAYER_CHAIN_ID_HEX = "0xC4";

export function WalletModal() {
  const { isModalOpen, closeModal, chainId, address, isCorrectChain, setWalletState } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);

  const hasEthereum = typeof window !== "undefined" && !!window.ethereum;

  useEffect(() => {
    if (!hasEthereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      setWalletState({
        address: accounts?.[0] || null,
        chainId,
      });
    };

    const handleChainChanged = (nextChainId: string) => {
      const parsed = Number.parseInt(nextChainId, 16);
      setWalletState({
        address,
        chainId: Number.isNaN(parsed) ? null : parsed,
      });
    };

    window.ethereum?.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum?.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [address, chainId, hasEthereum, setWalletState]);

  const walletRows = useMemo(() => WALLET_OPTIONS, []);

  const connectWallet = async (walletId: string) => {
    if (!window.ethereum) {
      setError("No injected wallet detected in this browser.");
      return;
    }

    try {
      setLoadingWallet(walletId);
      setError(null);
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      const parsedChainId = Number.parseInt(rawChainId, 16);

      setWalletState({
        address: accounts?.[0] || null,
        chainId: Number.isNaN(parsedChainId) ? null : parsedChainId,
      });
    } catch (err: any) {
      setError(err?.message || "Wallet connection failed.");
    } finally {
      setLoadingWallet(null);
    }
  };

  const switchToXLayer = async () => {
    if (!window.ethereum) {
      setError("No injected wallet detected in this browser.");
      return;
    }

    try {
      setError(null);
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN_ID_HEX }],
      });
      setWalletState({ address, chainId: XLAYER_CHAIN_ID_DECIMAL });
    } catch (err: any) {
      setError(err?.message || "Failed to switch to X Layer.");
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-black/10 bg-xyn-surface p-6 shadow-2xl dark:border-white/10 dark:bg-xyn-dark">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Connect wallet</h2>
            <p className="mt-2 text-sm text-xyn-muted dark:text-zinc-300">
              Select a wallet provider. X Layer mainnet is required for live protocol interactions.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-full border border-black/10 p-2 text-xyn-muted transition hover:text-xyn-dark dark:border-white/10 dark:hover:text-white"
            aria-label="Close wallet modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {walletRows.map((wallet) => (
            <div
              key={wallet.id}
              className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{wallet.name}</p>
                    {wallet.recommended ? (
                      <span className="rounded-full bg-xyn-gold/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-xyn-gold">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => connectWallet(wallet.id)}
                disabled={loadingWallet === wallet.id}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
              >
                {loadingWallet === wallet.id ? "Connecting..." : "Connect"}
              </button>
            </div>
          ))}
        </div>

        {!hasEthereum ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            No injected wallet was detected. Open this app in a wallet-enabled browser.
          </p>
        ) : null}

        {address && !isCorrectChain ? (
          <div className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Wrong network detected{chainId ? ` (chain ${chainId})` : ""}. Switch to X Layer mainnet.
            </p>
            <button
              type="button"
              onClick={switchToXLayer}
              className="mt-3 rounded-full bg-xyn-gold px-4 py-2 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
            >
              Switch to X Layer
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
