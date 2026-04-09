"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import deployments from "@/deployments.json";
import { useWallet } from "@/lib/wallet-context";

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
];
const XLAYER_CHAIN_ID = 196;
const XLAYER_CHAIN_ID_HEX = "0xC4";

function squadKey(squadId: string) {
  return ethers.encodeBytes32String(squadId.slice(0, 31));
}

function avatarVariant(name: string) {
  return name.length % 6;
}

function avatarClass(variant: number) {
  const variants = [
    "rounded-[28%] bg-[radial-gradient(circle_at_30%_30%,rgba(201,168,76,0.9),rgba(10,10,10,0.95))]",
    "rounded-[42%] bg-[linear-gradient(135deg,rgba(201,168,76,0.9),rgba(10,10,10,0.95))]",
    "rounded-[18%] bg-[conic-gradient(from_180deg,rgba(201,168,76,0.95),rgba(10,10,10,0.92),rgba(201,168,76,0.95))]",
    "rounded-[50%] bg-[radial-gradient(circle_at_70%_30%,rgba(201,168,76,0.9),rgba(10,10,10,0.95))]",
    "rounded-[14%] bg-[linear-gradient(45deg,rgba(10,10,10,0.95),rgba(201,168,76,0.95))]",
    "rounded-[36%] bg-[conic-gradient(from_90deg,rgba(10,10,10,0.95),rgba(201,168,76,0.95),rgba(10,10,10,0.95))]",
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
  const [unlockJson, setUnlockJson] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myLicenses, setMyLicenses] = useState<Strategy[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState("");
  const [listingAvailable, setListingAvailable] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingSuccess, setListingSuccess] = useState<string | null>(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [enrolledOptions, setEnrolledOptions] = useState<Strategy[]>([]);
  const [listingHint, setListingHint] = useState<string | null>(null);

  const strategyLicenseAddress = (deployments as any)?.StrategyLicense?.address || "0x8AbaCE8Ea22A591CE3109599449776A2cb96B186";
  const strategyRegistryAddress = (deployments as any)?.StrategyRegistry?.address;
  const seasonManagerAddress = (deployments as any)?.x402Details?.contract || "0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1";

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

  useEffect(() => {
    const loadStrategies = async () => {
      const res = await fetch("/api/strategies");
      const json = await res.json();
      setStrategies(json?.strategies || []);
    };

    const loadPrice = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
        const contract = new ethers.Contract(strategyLicenseAddress, LICENSE_ABI, provider);
        const wei = await contract.priceWei();
        setPriceWei(wei.toString());
        setPriceLabel(`${Number(ethers.formatEther(wei)).toFixed(4)} OKB`);
      } catch {
        setPriceLabel("0.50 USDC");
      }
    };

    loadStrategies();
    loadPrice();
  }, [strategyLicenseAddress]);

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
        setListingHint("Connect the enrolled squad wallet to list a strategy.");
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
        const seasonManager = new ethers.Contract(seasonManagerAddress, SEASON_MANAGER_ABI, provider);
        const squad = await seasonManager.squads(address);
        const owner = String(squad?.owner || ethers.ZeroAddress);
        const active = Boolean(squad?.active);

        if (owner.toLowerCase() !== address.toLowerCase() || !active) {
          setEnrolledOptions([]);
          setSelectedSquadId("");
          setListingHint("No active SeasonManager squad is enrolled for this connected wallet.");
          return;
        }

        const matched = strategies.filter((strategy) => strategy.creatorWallet?.toLowerCase() === address.toLowerCase());
        const options = matched.length
          ? matched
          : [{
              squadId: "SYNDICATE_ALPHA",
              name: "Xyndicate Alpha",
              mode: "momentum-arbitrage",
              assetPair: "ETH/USDC",
              allocationPercent: 25,
              riskTolerance: "Balanced",
              status: "ready",
              summary: "Owner-enrolled squad available for marketplace listing.",
            }];

        setEnrolledOptions(options);
        setSelectedSquadId((current) => current || options[0]?.squadId || "");
        setListingHint(null);
      } catch {
        setEnrolledOptions([]);
        setSelectedSquadId("");
        setListingHint("Could not load enrolled squad status from SeasonManager.");
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

  const handleBuyLicense = async () => {
    if (!selected) return;

    try {
      setBuying(true);
      setSheetError(null);
      setUnlockJson(null);

      const walletAddress = address || (await ensureWallet());
      if (!walletAddress) throw new Error("Wallet required");
      const injectedProvider = resolveProvider();
      if (!injectedProvider) throw new Error("Wallet provider unavailable");

      const provider = new ethers.BrowserProvider(injectedProvider as any);
      const signer = await provider.getSigner();
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
    } catch (error: any) {
      setSheetError(error?.shortMessage || error?.message || "License purchase failed");
    } finally {
      setBuying(false);
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

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Marketplace</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Strategy Marketplace</h1>
            <p className="mt-4 text-lg text-xyn-muted dark:text-zinc-300">License proven squad configurations via x402.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {address ? (
              <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark">
                My Licenses
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.3fr_1fr_0.8fr]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strategies"
            className="rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-gold dark:border-white/10"
          />
          <div className="flex flex-wrap gap-2">
            {["All", "Top PnL", "Conservative", "Balanced", "Aggressive"].map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => setFilter(pill)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === pill ? "bg-xyn-gold text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}
              >
                {pill}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-xyn-dark outline-none focus:border-xyn-gold dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            <option>Best Performance</option>
            <option>Most Decisions</option>
            <option>Newest</option>
          </select>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((strategy, index) => {
          const variant = avatarVariant(strategy.name);
          const positivePnl = strategy.performancePct ?? 0;
          const confidenceSeed = strategy.name.length + strategy.allocationPercent;
          const creator = strategy.creatorWallet || (deployments as any)?.DecisionLog?.address || "0xC9E69be5ecD65a9106800E07E05eE44a63559F8b";
          const licensed = !!licensedMap[strategy.squadId];

          return (
            <motion.div
              key={strategy.squadId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="rounded-[32px] border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`h-16 w-16 border border-black/10 dark:border-white/10 ${avatarClass(variant)}`} />
                {licensed ? <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">Licensed ✓</span> : null}
              </div>

              <div className="mt-5 text-2xl font-semibold">{strategy.name}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${strategyTypeClass(strategy.mode)}`}>{strategyTypeLabel(strategy.mode)}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskClass(strategy.riskTolerance)}`}>{strategy.riskTolerance}</span>
              </div>

              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <div className={`text-4xl font-semibold ${positivePnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
                    +{positivePnl.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">PnL</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold">{strategy.decisionCount ?? strategy.allocationPercent * 4}</div>
                  <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">Decisions</div>
                </div>
              </div>

              <div className="mt-5 text-sm text-xyn-muted dark:text-zinc-300">Creator: {truncateAddress(creator)}</div>

              <div className="mt-5 rounded-2xl bg-black/5 p-4 dark:bg-white/5">
                <svg viewBox="0 0 112 48" className="h-12 w-full">
                  <polyline
                    fill="none"
                    stroke="#C9A84C"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={strategy.confidenceScores?.length ? sparklineFromScores(strategy.confidenceScores) : sparklinePoints(confidenceSeed)}
                  />
                </svg>
              </div>

              <button
                type="button"
                onClick={() => setSelected(strategy)}
                className="mt-6 w-full rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
              >
                License for {priceLabel}
              </button>
            </motion.div>
          );
        })}
      </section>

      <section className="mt-10 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">List your strategy</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Earning from your strategy? List it here.</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4 rounded-2xl border border-black/10 p-5 dark:border-white/10">
            <div>
              <label className="mb-2 block text-sm font-semibold">Squad selector</label>
              <select
                value={selectedSquadId}
                onChange={(event) => setSelectedSquadId(event.target.value)}
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-xyn-dark outline-none focus:border-xyn-gold dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                disabled={!enrolledOptions.length}
              >
                {enrolledOptions.length ? enrolledOptions.map((strategy) => (
                  <option key={strategy.squadId} value={strategy.squadId}>{strategy.name}</option>
                )) : <option value="">No enrolled squad available</option>}
              </select>
            </div>

            <label className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 text-sm dark:border-white/10">
              <span className="font-semibold">Available for licensing</span>
              <button
                type="button"
                onClick={() => setListingAvailable((prev) => !prev)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${listingAvailable ? "bg-xyn-gold" : "bg-black/10 dark:bg-white/10"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${listingAvailable ? "translate-x-8" : "translate-x-1"}`} />
              </button>
            </label>

            {!strategyRegistryAddress ? (
              <div className="rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                StrategyRegistry deployment is required before listing can go live.
              </div>
            ) : null}

            {listingError ? <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{listingError}</div> : null}
            {listingSuccess ? <div className="rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{listingSuccess}</div> : null}
            {listingHint ? <div className="rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">{listingHint}</div> : null}

            <div className="text-xs text-xyn-muted dark:text-zinc-400">
              This live path uses a dedicated registry contract so existing license history stays intact.
            </div>
          </div>
          <button
            type="button"
            className="rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleListStrategy}
            disabled={!strategyRegistryAddress || !selectedSquadId || listingBusy}
          >
            {listingBusy ? "Listing..." : "List Strategy"}
          </button>
        </div>
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
              className="absolute bottom-0 left-0 right-0 mx-auto max-w-4xl rounded-t-[32px] bg-xyn-surface p-8 dark:bg-xyn-dark"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">License flow</p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-tight">{selected.name}</h3>
                  <div className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Creator wallet: {truncateAddress((deployments as any)?.DecisionLog?.address)}</div>
                  <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">Price: {priceLabel}</div>
                </div>
                <button type="button" onClick={() => { setSelected(null); setUnlockJson(null); setSheetError(null); }} className="text-sm font-semibold">Close</button>
              </div>

              <div className="mt-6 rounded-2xl border border-black/10 bg-white/70 p-5 text-sm dark:border-white/10 dark:bg-white/5">
                You get the live squad configuration summary, licensing proof tied to your wallet, and unlock state visible across the marketplace.
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => { setSelected(null); setUnlockJson(null); setSheetError(null); }}
                  className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBuyLicense}
                  disabled={buying}
                  className="rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {buying ? "Processing..." : "Pay & Unlock"}
                </button>
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
                  <div className="mt-4 flex gap-3">
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
              className="absolute right-0 top-0 h-full w-full max-w-md bg-xyn-surface p-8 shadow-2xl dark:bg-xyn-dark"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold">My Licenses</h3>
                <button type="button" onClick={() => setDrawerOpen(false)} className="text-sm font-semibold">Close</button>
              </div>
              <div className="mt-6 space-y-4">
                {myLicenses.length ? myLicenses.map((strategy) => (
                  <div key={strategy.squadId} className="rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
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
