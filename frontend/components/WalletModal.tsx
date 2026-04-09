"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";

const WALLET_OPTIONS = [
  { id: "okx", name: "OKX Wallet", recommended: true, icon: "/wallets/okx.jpg" },
  { id: "metamask", name: "MetaMask", icon: "/wallets/metamask.jpg" },
  { id: "rabby", name: "Rabby", icon: "/wallets/rabby.jpg" },
  { id: "zerion", name: "Zerion", icon: "/wallets/zerion.jpg" },
];

const XLAYER_CHAIN_ID_DECIMAL = 196;
const XLAYER_CHAIN_ID_HEX = "0xC4";

export function WalletModal() {
  const { isModalOpen, closeModal, chainId, address, isCorrectChain, selectedWallet, setWalletState, hasProvider } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);

  const resolveProvider = (walletId?: string | null) => {
    if (typeof window === "undefined") return null;

    const providers = window.ethereum?.providers;
    if (walletId && providers?.length) {
      const matched = providers.find((provider) => {
        if (walletId === "okx") return provider.isOKExWallet;
        if (walletId === "metamask") return provider.isMetaMask;
        if (walletId === "rabby") return provider.isRabby;
        if (walletId === "zerion") return provider.isZerion;
        return false;
      });
      if (matched) return matched;
    }

    if (walletId === "okx" && window.okxwallet?.request) {
      return window.okxwallet;
    }

    return window.ethereum ?? null;
  };

  useEffect(() => {
    const provider = resolveProvider(selectedWallet);
    if (!provider) return;

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

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [address, chainId, hasProvider, selectedWallet, setWalletState]);

  const walletRows = useMemo(() => WALLET_OPTIONS, []);

  const connectWallet = async (walletId: string) => {
    const provider = resolveProvider(walletId);
    if (!provider?.request) {
      setError("No injected wallet detected in this browser.");
      return;
    }

    try {
      setLoadingWallet(walletId);
      setError(null);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const rawChainId = await provider.request({ method: "eth_chainId" });
      const parsedChainId = Number.parseInt(rawChainId, 16);

      setWalletState({
        address: accounts?.[0] || null,
        chainId: Number.isNaN(parsedChainId) ? null : parsedChainId,
        selectedWallet: walletId,
      });
      closeModal();
    } catch (err: any) {
      setError(err?.message || "Wallet connection failed.");
    } finally {
      setLoadingWallet(null);
    }
  };

  const switchToXLayer = async () => {
    const provider = resolveProvider(selectedWallet);
    if (!provider?.request) {
      setError("No injected wallet detected in this browser.");
      return;
    }

    try {
      setError(null);
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN_ID_HEX }],
      });
      setWalletState({ address, chainId: XLAYER_CHAIN_ID_DECIMAL, selectedWallet });
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
                <img src={wallet.icon} alt={`${wallet.name} logo`} className="h-9 w-9 rounded-full bg-white object-cover" />
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

        {!hasProvider ? (
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
