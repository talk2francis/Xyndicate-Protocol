"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ethers } from "ethers";
import deployments from "@/deployments.json";
import { useWallet } from "@/lib/wallet-context";

const SEASON_MANAGER_ABI = [
  "function entryFee() view returns (uint256)",
  "function enroll(address agentWallet) external payable",
  "function squads(address) view returns (address owner, address agentWallet, bool active)",
];
const STRATEGY_VAULT_ABI = ["function deposit(bytes32 squadId) external payable"];
const XLAYER_CHAIN_ID = 196;
const XLAYER_CHAIN_ID_HEX = "0xC4";
const SYMBOLIC_DEPOSIT = "0.001";
const FIRST_CYCLE_SECONDS = 30 * 60;

type Risk = "Conservative" | "Balanced" | "Aggressive";
type Pair = "ETH/USDC" | "OKB/USDC" | "BTC/USDC";
type Mode = "Trend Following" | "Mean Reversion";

function sanitizeSquadName(value: string) {
  return value.replace(/\s+/g, "").slice(0, 20);
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function riskTone(risk: Risk) {
  if (risk === "Conservative") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (risk === "Aggressive") return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

export default function DeployPage() {
  const { address, chainId, connect, isCorrectChain, selectedWallet, setWalletState } = useWallet();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [squadName, setSquadName] = useState("");
  const [risk, setRisk] = useState<Risk>("Balanced");
  const [pair, setPair] = useState<Pair>("ETH/USDC");
  const [mode, setMode] = useState<Mode>("Trend Following");
  const [allocation, setAllocation] = useState(15);
  const [entryFee, setEntryFee] = useState<string>(SYMBOLIC_DEPOSIT);
  const [loadingFee, setLoadingFee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollTxHash, setEnrollTxHash] = useState<string | null>(null);
  const [vaultTxHash, setVaultTxHash] = useState<string | null>(null);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
  const [cycleCountdown, setCycleCountdown] = useState(FIRST_CYCLE_SECONDS);
  const [mySquad, setMySquad] = useState<any>(null);
  const [mySquadLoading, setMySquadLoading] = useState(false);
  const [mySquadError, setMySquadError] = useState<string | null>(null);
  const mySquadRef = useRef<HTMLDivElement | null>(null);

  const seasonManagerAddress = (deployments as any)?.SeasonManagerV2?.address || (deployments as any)?.x402Details?.contract || "0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1";
  const strategyVaultAddress = (deployments as any)?.StrategyVault?.address || "0x6002767f909B3049d5A65beAD84A843a385a61aC";

  const canContinue = squadName.length > 0 && pair && mode && risk && allocation >= 5;
  const okLinkEnroll = enrollTxHash ? `https://www.oklink.com/xlayer/tx/${enrollTxHash}` : null;
  const okLinkVault = vaultTxHash ? `https://www.oklink.com/xlayer/tx/${vaultTxHash}` : null;
  const tweetUrl = enrollTxHash
    ? `https://x.com/intent/tweet?text=${encodeURIComponent(`Just deployed ${squadName} squad on @XLayerOfficial via @xyndicatepro 🤖 #XLayerHackathon ${enrollTxHash}`)}`
    : null;

  useEffect(() => {
    if (step !== 3) return;
    const interval = setInterval(() => {
      setCycleCountdown((prev) => (prev <= 1 ? FIRST_CYCLE_SECONDS : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  useEffect(() => {
    const loadEntryFee = async () => {
      try {
        setLoadingFee(true);
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech");
        const contract = new ethers.Contract(seasonManagerAddress, SEASON_MANAGER_ABI, provider);
        const fee = await contract.entryFee();
        setEntryFee(ethers.formatEther(fee));
      } catch {
        setEntryFee(SYMBOLIC_DEPOSIT);
      } finally {
        setLoadingFee(false);
      }
    };

    loadEntryFee();
  }, [seasonManagerAddress]);

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

  const ensureWalletOnXLayer = async () => {
    const provider = resolveProvider();
    if (!provider?.request) throw new Error("No wallet provider detected");

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const currentChainHex = await provider.request({ method: "eth_chainId" });
    const currentChainId = Number.parseInt(currentChainHex, 16);

    if (currentChainId !== XLAYER_CHAIN_ID) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN_ID_HEX }],
      });
    }

    setWalletState({ address: accounts?.[0] || null, chainId: XLAYER_CHAIN_ID, selectedWallet });
    return accounts?.[0] || null;
  };

  const handleEnroll = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const walletAddress = address || (await ensureWalletOnXLayer());
      if (!walletAddress) throw new Error("Wallet connection required");
      const injectedProvider = resolveProvider();
      if (!injectedProvider) throw new Error("Wallet provider unavailable");

      const provider = new ethers.BrowserProvider(injectedProvider as any);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      const seasonManager = new ethers.Contract(seasonManagerAddress, SEASON_MANAGER_ABI, signer);
      const strategyVault = new ethers.Contract(strategyVaultAddress, STRATEGY_VAULT_ABI, signer);
      const squadId = ethers.encodeBytes32String(squadName.toUpperCase().slice(0, 31));
      const requiredFee = ethers.parseEther(entryFee || SYMBOLIC_DEPOSIT);

      const existingSquad = await seasonManager.squads(signerAddress);
      if (existingSquad?.owner && existingSquad.owner !== ethers.ZeroAddress && existingSquad.active) {
        throw new Error(`This wallet already has an active squad. In Market, click Connect wallet to manage squad, then use Close squad for a full reset or Deactivate for a soft pause before creating a new one.`);
      }

      const enrollTx = await seasonManager.enroll(signerAddress, { value: requiredFee });
      setEnrollTxHash(enrollTx.hash);
      await enrollTx.wait();

      const depositTx = await strategyVault.deposit(squadId, {
        value: ethers.parseEther(SYMBOLIC_DEPOSIT),
      });
      setVaultTxHash(depositTx.hash);
      await depositTx.wait();

      try {
        const response = await fetch('/api/register-squad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            squadName: squadName,
            walletAddress: walletAddress,
            riskMode: risk,
            baseAsset: pair,
            strategyMode: mode,
            enrollTx: enrollTx.hash,
            registeredAt: Date.now(),
          }),
        });
        const result = await response.json().catch(() => null);
        setRegistrationMessage(result?.message || 'Squad registered. First decision in next cycle.');
      } catch {
        setRegistrationMessage('Squad registered. First decision in next cycle.');
      }

      setCycleCountdown(FIRST_CYCLE_SECONDS);
      setStep(3);
      window.setTimeout(() => {
        void fetch(`/api/my-squad?wallet=${encodeURIComponent(walletAddress)}`, { cache: "no-store" })
          .then((res) => res.json())
          .then((json) => setMySquad(json?.squad || null))
          .catch(() => null)
          .finally(() => mySquadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }, 250);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Enrollment failed");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const loadMySquad = async () => {
      if (!address) {
        setMySquad(null);
        setMySquadError(null);
        return;
      }
      try {
        setMySquadLoading(true);
        const res = await fetch(`/api/my-squad?wallet=${encodeURIComponent(address)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load squad");
        setMySquad(json?.squad || null);
        setMySquadError(null);
      } catch (error: any) {
        setMySquad(null);
        setMySquadError(error?.message || "Failed to load squad");
      } finally {
        setMySquadLoading(false);
      }
    };

    loadMySquad();
  }, [address, step]);

  const handleSquadAction = async (action: "deactivate" | "reactivate" | "cancel") => {
    if (!address || !mySquad?.squadName) return;
    const ok = window.confirm(
      action === "cancel"
        ? "This will permanently remove your squad from the leaderboard. This cannot be undone. Your on-chain enrollment transaction will remain on the blockchain. Confirm removal?"
        : action === "reactivate"
          ? "This will reactivate your squad on the leaderboard. Confirm?"
          : "This will pause your squad on the leaderboard. It will no longer make decisions. Confirm?",
    );
    if (!ok) return;

    try {
      const res = await fetch("/api/squad-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, squadId: mySquad.squadName, wallet: address }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Squad action failed");
      if (action === "cancel") {
        setMySquad(null);
      } else {
        setMySquad((prev: any) => prev ? { ...prev, deactivated: action === "deactivate" } : prev);
      }
    } catch (error: any) {
      setMySquadError(error?.message || "Squad action failed");
    }
  };

  const squadStatus = mySquad?.cancelled ? null : (mySquad?.deactivated ? "PAUSED" : "ACTIVE");


  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {[
          { id: 1, label: "Configure" },
          { id: 2, label: "Fund & Enroll" },
          { id: 3, label: "Live" },
        ].map((item) => {
          const isActive = step === item.id;
          const completed = step > item.id;
          return (
            <div key={item.id} className="flex items-center gap-3">
              <div
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  isActive ? "bg-xyn-blue text-xyn-dark" : completed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "border border-black/10 dark:border-white/10"
                }`}
              >
                {completed ? `✓ Step ${item.id}` : `Step ${item.id}`}
              </div>
              <span className="text-sm text-xyn-muted dark:text-zinc-300">{item.label}</span>
              {item.id < 3 ? <span className="text-xyn-muted">→</span> : null}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.section
            key="step-1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]"
          >
            <div className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
              <h1 className="text-4xl font-semibold tracking-tight">Configure your squad</h1>
              <div className="mt-8 space-y-8">
                <div>
                  <label className="mb-3 block text-sm font-semibold">Squad Name</label>
                  <input
                    value={squadName}
                    onChange={(e) => setSquadName(sanitizeSquadName(e.target.value))}
                    maxLength={20}
                    placeholder="ALPHAONE"
                    className="w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-blue dark:border-white/10"
                  />
                  <div className="mt-2 text-right text-xs text-xyn-muted dark:text-zinc-400">{squadName.length}/20</div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold">Risk Tolerance</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {(["Conservative", "Balanced", "Aggressive"] as Risk[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRisk(option)}
                        className={`rounded-2xl border px-4 py-4 text-left ${risk === option ? "border-xyn-blue bg-xyn-blue/10" : "border-black/10 dark:border-white/10"}`}
                      >
                        <div className="font-semibold">{option}</div>
                        <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">
                          {option === "Conservative"
                            ? "HOLD-heavy, low drawdown"
                            : option === "Balanced"
                              ? "Moderate exposure across cycles"
                              : "High allocation, frequent trades"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-semibold">Base Asset Pair</label>
                  <select
                    value={pair}
                    onChange={(e) => setPair(e.target.value as Pair)}
                    className="w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-blue dark:border-white/10"
                  >
                    <option>ETH/USDC</option>
                    <option>OKB/USDC</option>
                    <option>BTC/USDC</option>
                  </select>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold">Strategy Mode</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(["Trend Following", "Mean Reversion"] as Mode[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setMode(option)}
                        className={`rounded-2xl border px-4 py-4 text-left ${mode === option ? "border-xyn-blue bg-xyn-blue/10" : "border-black/10 dark:border-white/10"}`}
                      >
                        <div className="font-semibold">{option}</div>
                        <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">
                          {option === "Trend Following"
                            ? "Ride confirmed direction with disciplined entries."
                            : "Fade stretched moves and rebalance into mean levels."}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold">Allocation Size</div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={allocation}
                    onChange={(e) => setAllocation(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Each action deploys {allocation}% of treasury</div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canContinue}
                  className="w-full rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  Continue to Fund →
                </button>
              </div>
            </div>

            <div ref={mySquadRef} className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">My Squad</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Your live squad status.</h2>
              {!address ? (
                <div className="mt-6 rounded-3xl border border-dashed border-black/10 p-6 text-sm text-xyn-muted dark:border-white/10 dark:text-zinc-300">Connect a wallet to see your squad.</div>
              ) : mySquadLoading ? (
                <div className="mt-6 h-52 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5" />
              ) : mySquadError ? (
                <div className="mt-6 rounded-3xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{mySquadError}</div>
              ) : !mySquad || mySquad.cancelled ? (
                <div className="mt-6 rounded-3xl border border-dashed border-black/10 p-6 text-sm text-xyn-muted dark:border-white/10 dark:text-zinc-300">No active squad deployed. Complete the wizard above to deploy one.</div>
              ) : (
                <div className="mt-6 rounded-3xl border border-black/10 bg-black/5 p-6 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-3xl font-semibold">{mySquad.squadName}</div>
                      <div className="mt-2 text-sm text-xyn-muted dark:text-zinc-300">{mySquad.strategyMode}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${squadStatus === "ACTIVE" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{squadStatus}</span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10"><div className="text-xs uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Squad ID</div><div className="mt-2 font-semibold">{mySquad.squadName}</div></div>
                    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10"><div className="text-xs uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Wallet</div><div className="mt-2 font-semibold">{address?.slice(0, 6)}...{address?.slice(-4)}</div></div>
                    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10"><div className="text-xs uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Pair</div><div className="mt-2 font-semibold">{mySquad.baseAsset}</div></div>
                    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10"><div className="text-xs uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Risk</div><div className="mt-2 font-semibold">{mySquad.riskMode}</div></div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button type="button" onClick={() => handleSquadAction(mySquad.deactivated ? "reactivate" : "deactivate")} className="flex-1 rounded-full border border-amber-500/40 px-5 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/10 dark:text-amber-300">{mySquad.deactivated ? "Reactivate" : "Deactivate Squad"}</button>
                    <button type="button" onClick={() => handleSquadAction("cancel")} className="flex-1 rounded-full border border-rose-500/40 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300">Cancel Squad</button>
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        ) : null}

        {step === 2 ? (
          <motion.section
            key="step-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5"
          >
            <h1 className="text-4xl font-semibold tracking-tight">Fund & enroll</h1>
            {error ? (
              <div className="mt-6 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                {error}
                <div className="mt-3">
                  <button type="button" onClick={handleEnroll} className="font-semibold underline">Retry</button>
                </div>
              </div>
            ) : null}
            <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-black/10 bg-xyn-surface p-6 dark:border-white/10 dark:bg-xyn-dark">
                <div className="space-y-3 text-sm">
                  <div><span className="text-xyn-muted dark:text-zinc-400">Squad</span><div className="font-semibold">{squadName}</div></div>
                  <div><span className="text-xyn-muted dark:text-zinc-400">Risk</span><div className="font-semibold">{risk}</div></div>
                  <div><span className="text-xyn-muted dark:text-zinc-400">Pair</span><div className="font-semibold">{pair}</div></div>
                  <div><span className="text-xyn-muted dark:text-zinc-400">Entry Fee</span><div className="font-semibold">{loadingFee ? "Loading..." : `${entryFee} OKB`}</div></div>
                </div>
              </div>

              <div>
                {!address ? (
                  <button
                    type="button"
                    onClick={connect}
                    className="w-full rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:opacity-90 sm:w-auto"
                  >
                    Connect Wallet
                  </button>
                ) : !isCorrectChain || chainId !== XLAYER_CHAIN_ID ? (
                  <button
                    type="button"
                    onClick={ensureWalletOnXLayer}
                    className="w-full rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:opacity-90 sm:w-auto"
                  >
                    Switch to X Layer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={submitting}
                    className="w-full rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {submitting ? "Submitting transaction..." : "Enroll Squad"}
                  </button>
                )}

                {enrollTxHash ? (
                  <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                    Enrollment submitted. {okLinkEnroll ? <a className="underline" href={okLinkEnroll} target="_blank" rel="noreferrer">View on OKLink</a> : null}
                  </div>
                ) : null}

              </div>
            </div>
          </motion.section>
        ) : null}

        {step === 3 ? (
          <motion.section
            key="step-3"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5"
          >
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="mb-6 text-6xl">✅</motion.div>
            <h1 className="text-4xl font-semibold tracking-tight">Squad {squadName} is now live!</h1>
            <div className="mt-8 space-y-4 text-sm">
              {okLinkEnroll ? <div>Enrollment TX: <a className="underline" href={okLinkEnroll} target="_blank" rel="noreferrer">{enrollTxHash}</a></div> : null}
              {okLinkVault ? <div>Vault Deposit TX: <a className="underline" href={okLinkVault} target="_blank" rel="noreferrer">{vaultTxHash}</a></div> : null}
              <div>{registrationMessage || `Squad ${squadName} is now registered. It will appear on the leaderboard within the next scheduler cycle (up to 30 minutes). It starts in PAUSED status and becomes ACTIVE after its first decision — within the next hour.`}</div>
              <div>First cycle runs in {formatCountdown(cycleCountdown)}</div>
            </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link href="/arena" className="w-full rounded-full bg-xyn-blue px-6 py-3 text-center text-sm font-semibold text-xyn-dark transition hover:opacity-90 sm:w-auto">
                View in Arena →
              </Link>
              {tweetUrl ? (
                <a href={tweetUrl} target="_blank" rel="noreferrer" className="w-full rounded-full border border-black/10 px-6 py-3 text-center text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 sm:w-auto">
                  Share on X →
                </a>
              ) : null}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
