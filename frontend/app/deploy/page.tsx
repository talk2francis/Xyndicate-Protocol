"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [cycleCountdown, setCycleCountdown] = useState(FIRST_CYCLE_SECONDS);

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
      if (existingSquad?.owner && existingSquad.owner !== ethers.ZeroAddress) {
        throw new Error(`This wallet is already enrolled in Season 1 with squad wallet ${existingSquad.agentWallet}. Go to Market to list it.`);
      }

      const enrollTx = await seasonManager.enroll(signerAddress, { value: requiredFee });
      setEnrollTxHash(enrollTx.hash);
      await enrollTx.wait();

      const depositTx = await strategyVault.deposit(squadId, {
        value: ethers.parseEther(SYMBOLIC_DEPOSIT),
      });
      setVaultTxHash(depositTx.hash);
      await depositTx.wait();

      setCycleCountdown(FIRST_CYCLE_SECONDS);
      setStep(3);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Enrollment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const preview = useMemo(
    () => ({
      squadName: squadName || "YOUR_SQUAD",
      risk,
      pair,
      mode,
      allocation,
    }),
    [allocation, mode, pair, risk, squadName],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center gap-3">
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
                  isActive ? "bg-xyn-gold text-xyn-dark" : completed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "border border-black/10 dark:border-white/10"
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
                    className="w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-gold dark:border-white/10"
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
                        className={`rounded-2xl border px-4 py-4 text-left ${risk === option ? "border-xyn-gold bg-xyn-gold/10" : "border-black/10 dark:border-white/10"}`}
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
                    className="w-full rounded-2xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-xyn-gold dark:border-white/10"
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
                        className={`rounded-2xl border px-4 py-4 text-left ${mode === option ? "border-xyn-gold bg-xyn-gold/10" : "border-black/10 dark:border-white/10"}`}
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
                  className="rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue to Fund →
                </button>
              </div>
            </div>

            <div className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Squad Preview</p>
              <div className="mt-6 rounded-3xl border border-black/10 bg-xyn-surface p-6 dark:border-white/10 dark:bg-xyn-dark">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold">{preview.squadName}</div>
                    <div className="mt-2 text-sm text-xyn-muted dark:text-zinc-300">{preview.pair}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskTone(preview.risk)}`}>{preview.risk}</span>
                </div>
                <div className="mt-6 space-y-3 text-sm text-xyn-muted dark:text-zinc-300">
                  <div>Mode: <span className="font-medium text-xyn-dark dark:text-white">{preview.mode}</span></div>
                  <div>Allocation: <span className="font-medium text-xyn-dark dark:text-white">{preview.allocation}%</span></div>
                  <div>Status: <span className="font-medium text-emerald-600 dark:text-emerald-300">Ready for enrollment</span></div>
                </div>
              </div>
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
                    className="rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
                  >
                    Connect Wallet
                  </button>
                ) : !isCorrectChain || chainId !== XLAYER_CHAIN_ID ? (
                  <button
                    type="button"
                    onClick={ensureWalletOnXLayer}
                    className="rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
                  >
                    Switch to X Layer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={submitting}
                    className="rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Submitting transaction..." : "Enroll Squad"}
                  </button>
                )}

                {enrollTxHash ? (
                  <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                    Enrollment submitted. {okLinkEnroll ? <a className="underline" href={okLinkEnroll} target="_blank" rel="noreferrer">View on OKLink</a> : null}
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                    <div className="mt-3">
                      <button type="button" onClick={handleEnroll} className="font-semibold underline">Try again</button>
                    </div>
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
              <div>First cycle runs in {formatCountdown(cycleCountdown)}</div>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/arena" className="rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90">
                View in Arena →
              </Link>
              {tweetUrl ? (
                <a href={tweetUrl} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-6 py-3 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
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
