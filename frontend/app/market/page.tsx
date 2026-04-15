"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import deployments from "@/deployments.json";
import { useWallet } from "@/lib/wallet-context";

type MySquadResponse = { squad: null | { squadName?: string | null; walletAddress?: string | null; registeredAt?: number; cancelled?: boolean; deactivated?: boolean; } };

type Strategy = {
  squadId: string;
  name: string;
  mode: string;
  assetPair: string;
  allocationPercent: number;
  riskTolerance: string;
  status: string;
  summary: string;
  createdAt?: string;
  creatorWallet?: string;
  performancePct?: number;
  decisionCount?: number;
  confidenceScores?: number[];
  listedOnMarket?: boolean;
  cancelled?: boolean;
  avatarSvg?: string;
};

type TierKey = "strategy-config" | "signal-access" | "subscription-24h";

type TierMeta = {
  label: string;
  displayPrice: string;
  amountOkb: string;
  durationSeconds?: number;
};

const LICENSE_ABI = [
  "function buyLicense(bytes32 squadId) external payable",
  "function isLicensed(address caller, bytes32 squadId) external view returns (bool)",
  "function priceWei() external view returns (uint256)",
];
const REGISTRY_ABI = [
  "function listStrategy(bytes32 squadId, string name, string assetPair, string mode, string risk, bool available) external",
];
const SEASON_MANAGER_ABI = [
  "function squads(address) external view returns (address owner, address agentWallet, bool active)",
  "function deactivate() external",
];

const STRATEGY_VAULT_ABI = [
  "function getVaultStats(bytes32 squadId) view returns (uint256 deposited, int256 pnl, uint256 ts)",
];
const XLAYER_CHAIN_ID = 196;
const XLAYER_CHAIN_ID_HEX = "0xC4";

function squadKey(squadId: string) {
  return ethers.encodeBytes32String(squadId.slice(0, 31));
}

function hashSeed(value: string) {
  return Array.from(value || "").reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 0);
}

function generateSquadAvatar(squadName: string): string {
  let hash = 0;
  for (let i = 0; i < squadName.length; i++) {
    hash = squadName.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 60) % 360;
  const color1 = `hsl(${hue1}, 70%, 60%)`;
  const color2 = `hsl(${hue2}, 70%, 40%)`;
  const pattern = Math.abs(hash) % 4;

  const svgContent = pattern === 0
    ? `<polygon points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" fill="${color1}" stroke="${color2}" stroke-width="2"/><polygon points="50,20 80,35 80,65 50,80 20,65 20,35" fill="${color2}" opacity="0.6"/>`
    : pattern === 1
      ? `<rect x="10" y="10" width="35" height="35" rx="6" fill="${color1}"/><rect x="55" y="10" width="35" height="35" rx="6" fill="${color2}"/><rect x="10" y="55" width="35" height="35" rx="6" fill="${color2}"/><rect x="55" y="55" width="35" height="35" rx="6" fill="${color1}" opacity="0.7"/><line x1="45" y1="27.5" x2="55" y2="27.5" stroke="white" stroke-width="2"/><line x1="27.5" y1="45" x2="27.5" y2="55" stroke="white" stroke-width="2"/>`
      : pattern === 2
        ? `<polygon points="50,5 95,50 50,95 5,50" fill="${color1}"/><polygon points="50,20 80,50 50,80 20,50" fill="${color2}"/><circle cx="50" cy="50" r="12" fill="white" opacity="0.3"/>`
        : `<circle cx="50" cy="50" r="45" fill="${color1}"/><circle cx="50" cy="50" r="30" fill="${color2}"/><circle cx="50" cy="50" r="15" fill="${color1}" opacity="0.8"/><circle cx="50" cy="50" r="5" fill="white" opacity="0.9"/>`;

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svgContent}</svg>`;
}

function avatarClass(variant: number) {
  const variants = [
    "rounded-xl",
    "rounded-xl",
    "rounded-xl",
    "rounded-xl",
    "rounded-xl",
    "rounded-xl",
  ];
  return variants[variant];
}

function sparklinePoints(seed: number) {
  const values = Array.from({ length: 8 }).map((_, index) => 45 + ((seed * 7 + index * 11) % 40));
  return values
    .map((value, index) => `${index * 16},${100 - value}`)
    .join(" ");
}

function sparklineFromScores(scores?: number[]) {
  const values = (scores && scores.length ? scores : [60, 63, 67, 69, 72, 74, 77, 79]).slice(0, 8);
  return values.map((value, index) => `${index * 16},${100 - value}`).join(" ");
}

function truncateAddress(address?: string | null) {
  if (!address) return "0x0000...0000";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function strategyTypeLabel(mode: string) {
  return mode.toLowerCase().includes("mean") ? "Mean Reversion" : "Trend";
}

function strategyTypeClass(mode: string) {
  return mode.toLowerCase().includes("mean") ? "bg-teal-500/15 text-teal-600 dark:text-teal-300" : "bg-purple-500/15 text-purple-600 dark:text-purple-300";
}

function riskClass(risk: string) {
  const normalized = risk.toLowerCase();
  if (normalized.includes("low") || normalized.includes("conservative")) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (normalized.includes("aggressive") || normalized.includes("high")) return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

function RetryState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
      {message}
      <button type="button" onClick={onRetry} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">
        Retry
      </button>
    </div>
  );
}

function StrategySkeleton() {
  return <div className="h-[360px] animate-pulse rounded-[32px] bg-black/5 dark:bg-xyn-cream/5" />;
}

export default function MarketPage() {
  const { address, connect, isCorrectChain, selectedWallet, setWalletState } = useWallet();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Best Performance");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [licensedMap, setLicensedMap] = useState<Record<string, boolean>>({});
  const [priceLabel, setPriceLabel] = useState("0.50 USDC");
  const [priceWei, setPriceWei] = useState<string>((deployments as any)?.StrategyLicense?.priceWei || "200000000000000");
  const [tiers, setTiers] = useState<Record<string, TierMeta>>({});
  const [tierUnlocks, setTierUnlocks] = useState<Record<string, { txHash: string; expiresAt?: number | null }>>({});
  const [unlockJson, setUnlockJson] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [activeTier, setActiveTier] = useState<TierKey>("strategy-config");
  const [buyingTier, setBuyingTier] = useState<TierKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myLicenses, setMyLicenses] = useState<Strategy[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState("");
  const [listingAvailable, setListingAvailable] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingSuccess, setListingSuccess] = useState<string | null>(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [delistingBusy, setDelistingBusy] = useState(false);
  const [delistingError, setDelistingError] = useState<string | null>(null);
  const [delistingSuccess, setDelistingSuccess] = useState<string | null>(null);
  const [enrolledOptions, setEnrolledOptions] = useState<Strategy[]>([]);
  const [listingHint, setListingHint] = useState<string | null>(null);
  const [mySquad, setMySquad] = useState<MySquadResponse["squad"] | null>(null);
  const [mySquadLoading, setMySquadLoading] = useState(false);

  const strategyLicenseAddress = (deployments as any)?.StrategyLicense?.address || "0x8AbaCE8Ea22A591CE3109599449776A2cb96B186";
  const directPaymentReceiver = "0x795009bb38a32348344a36a4cfcb36e4e84cb8d8";
  const strategyRegistryAddress = (deployments as any)?.StrategyRegistry?.address;
  const seasonManagerAddress = (deployments as any)?.SeasonManagerV2?.address || (deployments as any)?.x402Details?.contract || "0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1";
  const strategyVaultAddress = (deployments as any)?.StrategyVault?.address || "0x6002767f909B3049d5A65beAD84A843a385a61aC";

  const resolveProvider = () => {
    if (typeof window === "undefined") return null;
    const providers = window.ethereum?.providers;
    if (selectedWallet && providers?.length) {
      const matched = providers.find((provider) => {
        if (selectedWallet === "okx") return provider.isOKExWallet;
        if (selectedWallet === "metamask") return provider.isMetaMask;
        if (selectedWallet === "rabby") return provider.isRabby;
        if (selectedWallet === "zerion") return provider.isZerion;
        return false;
      });
      if (matched) return matched;
    }

    if (selectedWallet === "okx" && window.okxwallet?.request) {
      return window.okxwallet;
    }

    return window.ethereum ?? window.okxwallet ?? null;
  };

  const {
    isLoading: loadingStrategies,
    isError: strategiesError,
    refetch: refetchStrategies,
  } = useQuery({
    queryKey: ["market-strategies", strategyLicenseAddress],
    queryFn: async () => {
      const res = await fetch("/api/strategies", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load strategies");
      setStrategies(json?.strategies || []);

      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
        const contract = new ethers.Contract(strategyLicenseAddress, LICENSE_ABI, provider);
        const wei = await contract.priceWei();
        setPriceWei(wei.toString());
        setPriceLabel(`${Number(ethers.formatEther(wei)).toFixed(4)} OKB`);
      } catch {
        setPriceLabel("0.50 USDC");
      }

      return json;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    const loadTiers = async () => {
      try {
        const res = await fetch("/api/x402/tiers", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) {
          setTiers(json?.tiers || {});
        }
      } catch {}
    };

    loadTiers();
  }, []);

  useEffect(() => {
    const loadLicenses = async () => {
      if (!address) {
        setLicensedMap({});
        setMyLicenses([]);
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
        const contract = new ethers.Contract(strategyLicenseAddress, LICENSE_ABI, provider);
        const checks = await Promise.all(
          strategies.map(async (strategy) => {
            const licensed = await contract.isLicensed(address, squadKey(strategy.squadId)).catch(() => false);
            return [strategy.squadId, licensed] as const;
          }),
        );

        const map = Object.fromEntries(checks);
        setLicensedMap(map);
        setMyLicenses(strategies.filter((strategy) => map[strategy.squadId]));
      } catch {
        setLicensedMap({});
        setMyLicenses([]);
      }
    };

    loadLicenses();
  }, [address, strategies, strategyLicenseAddress]);

  useEffect(() => {
    const loadEligibleListings = async () => {
      if (!address) {
        setEnrolledOptions([]);
        setSelectedSquadId("");
        setMySquad(null);
        setMySquadLoading(false);
        setListingHint("Connect the enrolled squad wallet to list a strategy.");
        return;
      }

      try {
        setMySquadLoading(true);
        const mySquadResponse = await fetch(`/api/my-squad?wallet=${encodeURIComponent(address)}`, { cache: "no-store" });
        const mySquadJson: MySquadResponse = await mySquadResponse.json();
        const squad = mySquadJson?.squad || null;

        setMySquad(squad);

        if (!squad) {
          setEnrolledOptions([]);
          setSelectedSquadId("");
          setListingHint("No active squad. Deploy one first →");
          return;
        }

        const matched = strategies.filter((strategy) => strategy.creatorWallet?.toLowerCase() === address.toLowerCase());
        let options = matched;
        const externalDisplayName = squad.squadName || matched[0]?.squadId || "";

        if (!options.length) {
          const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
          const vault = new ethers.Contract(strategyVaultAddress, STRATEGY_VAULT_ABI, provider);
          const candidateNames = ["HI", "XYNDICATE_ALPHA", "XYNDICATE_BETA", "ALPHA", "BETA"];
          let detectedName = externalDisplayName || "HI";
          let detectedPnl = 0;

          for (const name of candidateNames) {
            try {
              const stats = await vault.getVaultStats(ethers.encodeBytes32String(name.slice(0, 31)));
              const deposited = Number(ethers.formatEther(stats[0] || 0n));
              if (deposited > 0) {
                detectedName = name;
                detectedPnl = Number(stats[1] || 0n);
                break;
              }
            } catch {}
          }

          options = [{
            squadId: detectedName,
            name: detectedName,
            mode: "momentum-arbitrage",
            assetPair: "OKB/USDC",
            allocationPercent: 15,
            riskTolerance: "Balanced",
            status: "live",
            summary: "Live enrolled squad available for marketplace listing.",
            creatorWallet: address,
            performancePct: detectedPnl,
            decisionCount: 1,
            confidenceScores: [68, 71, 73, 76, 79, 81, 83, 85],
          }];
        }

        setEnrolledOptions(options);
        setSelectedSquadId((current) => current || options[0]?.squadId || "");
        setListingHint(null);
        setDelistingError(null);
        setDelistingSuccess(null);
      } catch {
        setEnrolledOptions([]);
        setSelectedSquadId("");
        setMySquad(null);
        setListingHint("Could not load enrolled squad status from SeasonManager.");
      } finally {
        setMySquadLoading(false);
      }
    };

    loadEligibleListings();
  }, [address, seasonManagerAddress, strategies]);

  useEffect(() => {
    if (!actionToast) return;
    const timeout = window.setTimeout(() => setActionToast(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [actionToast]);

  const filtered = useMemo(() => {
    let result = strategies.filter((strategy) => strategy.name.toLowerCase().includes(search.toLowerCase()));

    if (filter === "Top PnL") result = result.filter((strategy) => (strategy.performancePct || 0) >= 10);
    if (filter === "Conservative") result = result.filter((strategy) => strategy.riskTolerance.toLowerCase().includes("conservative") || strategy.riskTolerance.toLowerCase().includes("low"));
    if (filter === "Balanced") result = result.filter((strategy) => strategy.riskTolerance.toLowerCase().includes("balanced") || strategy.riskTolerance.toLowerCase().includes("medium"));
    if (filter === "Aggressive") result = result.filter((strategy) => strategy.riskTolerance.toLowerCase().includes("aggressive") || strategy.riskTolerance.toLowerCase().includes("high"));

    if (sort === "Best Performance") result = [...result].sort((a, b) => (b.performancePct || 0) - (a.performancePct || 0));
    if (sort === "Most Decisions") result = [...result].sort((a, b) => (b.decisionCount || 0) - (a.decisionCount || 0));
    if (sort === "Newest") result = [...result].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return result;
  }, [filter, search, sort, strategies]);

  const ensureWallet = async () => {
    const provider = resolveProvider();
    if (!provider?.request) throw new Error("No wallet provider detected");
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const chainHex = await provider.request({ method: "eth_chainId" });
    const chainId = Number.parseInt(chainHex, 16);

    if (chainId !== XLAYER_CHAIN_ID) {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: XLAYER_CHAIN_ID_HEX }] });
    }

    setWalletState({ address: accounts?.[0] || null, chainId: XLAYER_CHAIN_ID, selectedWallet });
    return accounts?.[0] || null;
  };

  const handleBuyLicense = async (tier: TierKey = "strategy-config") => {
    if (!selected) return;

    try {
      setActiveTier(tier);
      setBuying(true);
      setBuyingTier(tier);
      setSheetError(null);
      setUnlockJson(null);

      const walletAddress = address || (await ensureWallet());
      if (!walletAddress) throw new Error("Wallet required");
      const injectedProvider = resolveProvider();
      if (!injectedProvider) throw new Error("Wallet provider unavailable");

      const provider = new ethers.BrowserProvider(injectedProvider as any);
      const signer = await provider.getSigner();

      if (tier === "strategy-config") {
        const contract = new ethers.Contract(strategyLicenseAddress, LICENSE_ABI, signer);
        const tx = await contract.buyLicense(squadKey(selected.squadId), { value: BigInt(priceWei) });
        await tx.wait();

        const configResponse = await fetch(`/api/strategies/${selected.squadId}/config`, { cache: "no-store" });
        const configPayload = await configResponse.json();
        if (!configResponse.ok || !configPayload?.config) {
          throw new Error(configPayload?.error || "Strategy config unlock failed");
        }

        setLicensedMap((prev) => ({ ...prev, [selected.squadId]: true }));
        setMyLicenses((prev) => (prev.find((item) => item.squadId === selected.squadId) ? prev : [...prev, selected]));
        setUnlockJson(JSON.stringify(configPayload.config, null, 2));
      } else {
        const tierMeta = tiers[tier];
        if (!tierMeta) throw new Error("Tier metadata unavailable");
        const injected = resolveProvider();
        if (!injected?.request) throw new Error("Wallet provider unavailable");

        const txHash = await injected.request({
          method: "eth_sendTransaction",
          params: [{
            from: walletAddress,
            to: directPaymentReceiver,
            value: `0x${ethers.parseEther(tierMeta.amountOkb).toString(16)}`,
          }],
        });
        await provider.waitForTransaction(txHash);

        let purchaseRecord: { expiresAt?: number | null } = {};
        try {
          const recordResponse = await fetch("/api/x402/purchase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress,
              squadId: selected.squadId,
              tier,
              txHash,
            }),
          });
          const recordPayload = await recordResponse.json();
          if (recordResponse.ok && recordPayload?.purchase) {
            purchaseRecord = recordPayload.purchase;
          } else {
            setSheetError(recordPayload?.error || "Purchase recorded on-chain but registry sync is pending.");
          }
        } catch {
          setSheetError("Purchase confirmed, but registry sync is pending.");
        }

        setTierUnlocks((prev) => ({
          ...prev,
          [`${selected.squadId}:${tier}`]: {
            txHash,
            expiresAt: purchaseRecord?.expiresAt ?? (tier === "subscription-24h" ? Math.floor(Date.now() / 1000) + 86400 : null),
          },
        }));

        if (tier === "signal-access") {
          const signalResponse = await fetch("/api/signal", { cache: "no-store" });
          const signalPayload = await signalResponse.json();
          if (!signalResponse.ok) throw new Error(signalPayload?.error || "Signal unlock failed");
          setUnlockJson(JSON.stringify({
            unlockedTier: "Signal Access",
            txHash,
            signal: signalPayload,
          }, null, 2));
        }

        if (tier === "subscription-24h") {
          setUnlockJson(JSON.stringify({
            tier: "24h Subscription",
            squadId: selected.squadId,
            txHash,
            activeUntil: purchaseRecord?.expiresAt ?? Math.floor(Date.now() / 1000) + 86400,
            message: "All Oracle signals unlocked for 24 hours.",
          }, null, 2));
        }
      }
    } catch (error: any) {
      setSheetError(error?.shortMessage || error?.message || "License purchase failed");
    } finally {
      setBuying(false);
      setBuyingTier(null);
    }
  };

  const downloadJson = () => {
    if (!unlockJson || !selected) return;
    const blob = new Blob([unlockJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.squadId.toLowerCase()}-config.json`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setActionToast("Downloaded");
  };

  const copyJson = async () => {
    if (!unlockJson) return;
    try {
      await navigator.clipboard.writeText(unlockJson);
      setSheetError(null);
      setActionToast("Copied");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = unlockJson;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setSheetError(null);
        setActionToast("Copied");
      } catch {
        setSheetError("Copy failed. Please select and copy the JSON manually.");
      }
    }
  };

  const handleListStrategy = async () => {
    if (!strategyRegistryAddress) {
      setListingError("StrategyRegistry is not deployed yet.");
      setListingSuccess(null);
      return;
    }

    const strategy = enrolledOptions.find((item) => item.squadId === selectedSquadId);
    if (!strategy) {
      setListingError("No eligible enrolled squad found for listing.");
      setListingSuccess(null);
      return;
    }

    try {
      setListingBusy(true);
      setListingError(null);
      setListingSuccess(null);

      const walletAddress = address || (await ensureWallet());
      if (!walletAddress) throw new Error("Wallet required");
      const injectedProvider = resolveProvider();
      if (!injectedProvider) throw new Error("Wallet provider unavailable");

      const provider = new ethers.BrowserProvider(injectedProvider as any);
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(strategyRegistryAddress, REGISTRY_ABI, signer);
      const tx = await registry.listStrategy(
        squadKey(strategy.squadId),
        strategy.name,
        strategy.assetPair,
        strategy.mode,
        strategy.riskTolerance,
        listingAvailable,
      );
      await tx.wait();

      setListingSuccess(`${strategy.name} listed successfully.`);
    } catch (error: any) {
      setListingError(error?.shortMessage || error?.message || "Strategy listing failed");
    } finally {
      setListingBusy(false);
    }
  };

  const handleDelistSquad = async () => {
    try {
      setDelistingBusy(true);
      setDelistingError(null);
      setDelistingSuccess(null);

      const walletAddress = address || (await ensureWallet());
      if (!walletAddress) throw new Error("Wallet required");
      const injectedProvider = resolveProvider();
      if (!injectedProvider) throw new Error("Wallet provider unavailable");

      const provider = new ethers.BrowserProvider(injectedProvider as any);
      const signer = await provider.getSigner();
      const seasonManager = new ethers.Contract(seasonManagerAddress, SEASON_MANAGER_ABI, signer);
      const tx = await seasonManager.deactivate();
      await tx.wait();

      setDelistingSuccess("Squad deactivated. Use Close squad for a full re-enroll reset.");
      setListingHint("Deactivate keeps history visible. Close squad fully resets the slot.");
      setMySquad(null);
      setEnrolledOptions([]);
      setSelectedSquadId("");
    } catch (error: any) {
      setDelistingError(error?.shortMessage || error?.message || "Squad deactivation failed");
    } finally {
      setDelistingBusy(false);
    }
  };


  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <section className="rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Marketplace</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Strategy Marketplace</h1>
            <p className="mt-4 text-lg text-xyn-muted dark:text-zinc-300">License proven squad configurations via x402.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {address ? (
              <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark">
                My Licenses
              </button>
            ) : (
              <button type="button" onClick={connect} className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark">
                Connect wallet to manage squad
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.3fr_1fr_0.8fr]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strategies"
            className="rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-blue dark:border-white/10"
          />
          <div className="flex flex-wrap gap-2">
            {["All", "Top PnL", "Conservative", "Balanced", "Aggressive"].map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => setFilter(pill)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === pill ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}
              >
                {pill}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-2xl border border-black/10 bg-xyn-cream px-4 py-3 text-xyn-dark outline-none focus:border-xyn-blue dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option>Best Performance</option>
            <option>Most Decisions</option>
            <option>Newest</option>
          </select>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">x402 Tiers</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Three live access products.</h2>
            <p className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Each tier uses a distinct payment amount so proofs can visibly separate config unlocks, signal access, and 24h subscription access.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { key: "strategy-config", title: "Strategy Config", price: tiers["strategy-config"]?.displayPrice || priceLabel, detail: "Unlock the current squad configuration package." },
            { key: "signal-access", title: "Signal Access", price: tiers["signal-access"]?.displayPrice || "0.10 USDC", detail: "Unlock the current Oracle signal with ETH price, Uniswap spread, and recommendation." },
            { key: "subscription-24h", title: "24h Subscription", price: tiers["subscription-24h"]?.displayPrice || "1.00 USDC", detail: "Unlock all Oracle signals for 24 hours with countdown-based access." },
          ].map((tier) => (
            <div key={tier.key} className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-xyn-cream/5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-blue">{tier.title}</div>
              <div className="mt-3 text-3xl font-semibold">{tier.price}</div>
              <div className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">{tier.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Strategy grid</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Live licenseable strategies.</h2>
            <p className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Includes seeded Xyndicate strategies plus any squad listed on-market by its owner.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loadingStrategies ? (
            Array.from({ length: 6 }).map((_, index) => <StrategySkeleton key={index} />)
          ) : strategiesError ? (
            <RetryState message="Failed to load strategy grid." onRetry={() => refetchStrategies()} />
          ) : filtered.length ? (
            filtered.map((strategy) => {
              const variant = hashSeed(strategy.name) % 6;
              const avatarData = strategy.avatarSvg || generateSquadAvatar(strategy.name);
              return (
                <motion.button key={strategy.squadId} type="button" onClick={() => setSelected(strategy)} className="relative overflow-hidden rounded-[32px] border border-black/10 bg-black/5 p-5 text-left dark:border-white/10 dark:bg-xyn-cream/5">
                  <div className="absolute right-4 top-4 text-[14px] text-white/30">↻</div>
                  <div className="flex items-start gap-4">
                    <img src={avatarData} alt={strategy.name} className="w-16 h-16 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-2xl font-semibold">{strategy.name}</div>
                          <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-400">{strategy.assetPair} · {strategy.mode}</div>
                        </div>
                        <div className="text-right text-sm font-semibold {strategy.performancePct && strategy.performancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}">{strategy.performancePct && strategy.performancePct >= 0 ? '+' : ''}{(strategy.performancePct || 0).toFixed(1)}%</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${strategyTypeClass(strategy.mode)}`}>{strategyTypeLabel(strategy.mode)}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(strategy.riskTolerance)}`}>{strategy.riskTolerance}</span>
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-xyn-cream/10">{strategy.decisionCount || 0} decisions</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-xyn-muted dark:text-zinc-300">{strategy.summary}</p>
                      <div className="mt-4 text-xs uppercase tracking-[0.18em] text-xyn-muted dark:text-zinc-400">{strategy.listedOnMarket ? 'Listed on market' : 'Seed strategy'}</div>
                    </div>
                  </div>
                </motion.button>
              );
            })
          ) : (
            <div className="rounded-2xl border border-black/10 bg-black/5 p-5 text-sm text-xyn-muted dark:border-white/10 dark:bg-xyn-cream/5 dark:text-zinc-300">No strategies matched your filters.</div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">LIST YOUR STRATEGY</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Earning from your strategy? List it here.</h2>
          </div>
        </div>
        {!address ? (
          <div className="mt-6 rounded-3xl border border-black/10 bg-black/5 p-5 text-sm text-xyn-muted dark:border-white/10 dark:bg-xyn-cream/5 dark:text-zinc-300">Connect wallet to list your strategy.</div>
        ) : listingHint ? (
          <div className="mt-6 rounded-3xl border border-black/10 bg-black/5 p-5 text-sm text-xyn-muted dark:border-white/10 dark:bg-xyn-cream/5 dark:text-zinc-300">{listingHint} <Link href="/deploy" className="ml-2 font-semibold text-xyn-blue">Deploy one first.</Link></div>
        ) : mySquad?.cancelled ? (
          <div className="mt-6 rounded-3xl border border-black/10 bg-black/5 p-5 text-sm text-xyn-muted dark:border-white/10 dark:bg-xyn-cream/5 dark:text-zinc-300">You need an active squad to list. <Link href="/deploy" className="font-semibold text-xyn-blue">Deploy one first.</Link></div>
        ) : (
          <div className="mt-6 grid gap-4 rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-xyn-cream/5 md:grid-cols-[1.2fr_auto] md:items-end">
            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Squad name</div>
                <input type="text" value={mySquadLoading ? "Loading squad..." : (mySquad?.squadName || "No active squad") } readOnly className="mt-2 w-full cursor-not-allowed rounded-2xl border border-black/10 bg-xyn-cream px-4 py-3 text-sm opacity-70 outline-none dark:border-white/10 dark:bg-zinc-900" />
              </div>
              <label className="flex items-center gap-3 text-sm text-xyn-muted dark:text-zinc-300">
                <input type="checkbox" checked={listingAvailable} onChange={(e) => setListingAvailable(e.target.checked)} className="h-4 w-4 rounded border-black/20" />
                Available for licensing
              </label>
            </div>
            <button type="button" onClick={handleListStrategy} disabled={listingBusy} className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark disabled:opacity-50">{listingBusy ? "Listing..." : "List Strategy"}</button>
          </div>
        )}
        {listingError ? <div className="mt-4 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{listingError}</div> : null}
        {listingSuccess ? <div className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{listingSuccess}</div> : null}
      </section>

      <AnimatePresence>
        {selected ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              className="absolute inset-0 mx-auto h-full w-full max-w-4xl overflow-y-auto rounded-none bg-xyn-surface p-6 sm:bottom-0 sm:left-0 sm:right-0 sm:top-auto sm:h-auto sm:max-h-[90vh] sm:rounded-t-[32px] sm:p-8 dark:bg-xyn-dark"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">License flow</p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-tight">{selected.name}</h3>
                  <div className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Creator wallet: {truncateAddress((deployments as any)?.DecisionLog?.address)}</div>
                  <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">Price: {priceLabel}</div>
                </div>
                <button type="button" onClick={() => { setSelected(null); setUnlockJson(null); setSheetError(null); }} className="text-sm font-semibold">Close</button>
              </div>

              <div className="mt-6 rounded-2xl border border-black/10 bg-xyn-cream p-5 text-sm dark:border-white/10 dark:bg-xyn-cream/5">
                <div className="font-semibold">Selected rail</div>
                <div className="mt-2 text-xyn-muted dark:text-zinc-300">
                  {activeTier === "strategy-config"
                    ? `Contract rail → ${strategyLicenseAddress}`
                    : `Direct wallet rail → ${directPaymentReceiver}`}
                </div>
                <div className="mt-3 text-xyn-muted dark:text-zinc-300">
                  {activeTier === "strategy-config"
                    ? "You get the live squad configuration summary, licensing proof tied to your wallet, and unlock state visible across the marketplace."
                    : "This tier uses a direct wallet payment rail, then records wallet-linked unlock state for demo access."}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => { setSelected(null); setUnlockJson(null); setSheetError(null); }}
                  className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10"
                >
                  Cancel
                </button>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBuyLicense("strategy-config")}
                    disabled={buying}
                    className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === "strategy-config" ? "Processing..." : `Strategy Config — ${tiers["strategy-config"]?.displayPrice || priceLabel}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBuyLicense("signal-access")}
                    disabled={buying}
                    className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === "signal-access" ? "Processing..." : `Signal Access — ${tiers["signal-access"]?.displayPrice || "0.10 USDC"}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBuyLicense("subscription-24h")}
                    disabled={buying}
                    className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === "subscription-24h" ? "Processing..." : `24h Subscription — ${tiers["subscription-24h"]?.displayPrice || "1.00 USDC"}`}
                  </button>
                </div>
                {!address ? (
                  <button type="button" onClick={connect} className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10">
                    Connect Wallet
                  </button>
                ) : !isCorrectChain ? (
                  <button type="button" onClick={ensureWallet} className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10">
                    Switch to X Layer
                  </button>
                ) : null}
              </div>

              {sheetError ? <div className="mt-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{sheetError}</div> : null}

              {unlockJson ? (
                <div className="mt-6">
                  <div className="mb-3 text-sm font-semibold">Unlocked config</div>
                  <pre className="overflow-x-auto rounded-2xl bg-black/90 p-5 text-sm text-green-400">{unlockJson}</pre>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={copyJson} className={`rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition ${actionToast === "Copied" ? "scale-95 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "dark:border-white/10"}`}>
                      Copy JSON
                    </button>
                    <button type="button" onClick={downloadJson} className={`rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition ${actionToast === "Downloaded" ? "scale-95 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "dark:border-white/10"}`}>
                      Download .json
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUnlockJson(null);
                        setSheetError(null);
                      }}
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setUnlockJson(null);
                        setSheetError(null);
                      }}
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10"
                    >
                      Done
                    </button>
                  </div>
                  <AnimatePresence>
                    {actionToast ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="mt-4 inline-flex rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300"
                      >
                        {actionToast}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/30">
            <motion.aside
              initial={{ x: 360 }}
              animate={{ x: 0 }}
              exit={{ x: 360 }}
              className="absolute inset-0 h-full w-full bg-xyn-surface p-6 shadow-2xl sm:left-auto sm:right-0 sm:top-0 sm:max-w-md sm:p-8 dark:bg-xyn-dark"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold">My Licenses</h3>
                <button type="button" onClick={() => setDrawerOpen(false)} className="text-sm font-semibold">Close</button>
              </div>
              <div className="mt-6 space-y-4">
                {myLicenses.length ? myLicenses.map((strategy) => (
                  <div key={strategy.squadId} className="rounded-2xl border border-black/10 bg-xyn-cream p-4 dark:border-white/10 dark:bg-xyn-cream/5">
                    <div className="font-semibold">{strategy.name}</div>
                    <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">{strategy.assetPair} · {strategy.mode}</div>
                  </div>
                )) : <div className="text-sm text-xyn-muted dark:text-zinc-300">No licensed strategies yet.</div>}
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
