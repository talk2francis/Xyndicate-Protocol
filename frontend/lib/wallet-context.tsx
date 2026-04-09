"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

const XLAYER_CHAIN_ID = 196;

export type WalletContextValue = {
  address: string | null;
  chainId: number | null;
  selectedWallet: string | null;
  isCorrectChain: boolean;
  isModalOpen: boolean;
  hasProvider: boolean;
  connect: () => void;
  disconnect: () => void;
  openModal: () => void;
  closeModal: () => void;
  setWalletState: (next: { address: string | null; chainId: number | null; selectedWallet?: string | null }) => void;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const detectProvider = () => {
      const provider = window.ethereum;
      setHasProvider(Boolean(provider || window.okxwallet));
    };

    detectProvider();
    window.addEventListener("focus", detectProvider);
    document.addEventListener("visibilitychange", detectProvider);

    return () => {
      window.removeEventListener("focus", detectProvider);
      document.removeEventListener("visibilitychange", detectProvider);
    };
  }, []);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const connect = useCallback(() => setIsModalOpen(true), []);
  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setSelectedWallet(null);
    setIsModalOpen(false);
  }, []);

  const setWalletState = useCallback((next: { address: string | null; chainId: number | null; selectedWallet?: string | null }) => {
    setAddress(next.address);
    setChainId(next.chainId);
    if (typeof next.selectedWallet !== "undefined") {
      setSelectedWallet(next.selectedWallet);
    }
  }, []);

  const value = useMemo(
    () => ({
      address,
      chainId,
      selectedWallet,
      isCorrectChain: chainId === XLAYER_CHAIN_ID,
      isModalOpen,
      hasProvider,
      connect,
      disconnect,
      openModal,
      closeModal,
      setWalletState,
    }),
    [address, chainId, closeModal, connect, disconnect, hasProvider, isModalOpen, openModal, selectedWallet, setWalletState],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
