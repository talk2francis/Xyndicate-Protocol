export type StrategyRecord = {
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
  avatarSvg?: string;
};

export function generateSquadAvatar(squadName: string) {
  const chars = Array.from(squadName || "SQUAD");
  let seed = 0;
  for (const char of chars) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const hue = seed % 360;
  const accent = (hue + 48) % 360;
  const shape = seed % 3;
  const strokeDash = 18 + (seed % 10);
  const rotate = seed % 180;

  const elements = [
    `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="hsl(${hue} 85% 62%)"/><stop offset="100%" stop-color="hsl(${accent} 70% 42%)"/></linearGradient></defs>`,
    `<rect width="100" height="100" rx="28" fill="url(#g)"/>`,
    shape === 0
      ? `<path d="M18 72 L50 18 L82 72 Z" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>`
      : shape === 1
        ? `<circle cx="50" cy="50" r="22" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.36)" stroke-width="4"/>`
        : `<rect x="24" y="24" width="52" height="52" rx="12" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.35)" stroke-width="3" transform="rotate(${rotate} 50 50)"/>`,
    `<path d="M16 50 H84" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-dasharray="${strokeDash} 8"/>`,
    `<path d="M50 16 V84" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>`,
  ].join("");

  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${elements}</svg>`)}`;
}

export const strategies: StrategyRecord[] = [
  {
    squadId: "XYNDICATE_ALPHA",
    name: "Xyndicate Alpha",
    mode: "momentum-arbitrage",
    assetPair: "ETH/USDC",
    allocationPercent: 25,
    riskTolerance: "Balanced",
    status: "ready",
    summary: "Primary strategy template for OKX and Uniswap spread capture once squad enrollment is fully live.",
    createdAt: "2026-04-07T20:00:00Z",
    creatorWallet: "0xC9E69be5ecD65a9106800E07E05eE44a63559F8b",
    performancePct: 14.3,
    decisionCount: 0,
    confidenceScores: [72, 76, 74, 81, 79, 84, 86, 88],
    listedOnMarket: false,
    avatarSvg: generateSquadAvatar("Xyndicate Alpha"),
  },
  {
    squadId: "XYNDICATE_BETA",
    name: "Xyndicate Beta",
    mode: "mean-reversion-defense",
    assetPair: "OKB/USDC",
    allocationPercent: 18,
    riskTolerance: "Conservative",
    status: "standby",
    summary: "Secondary strategy template focused on capital preservation and rotation between OKB and stable exposure.",
    createdAt: "2026-04-08T10:15:00Z",
    creatorWallet: "0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1",
    performancePct: 8.9,
    decisionCount: 0,
    confidenceScores: [61, 63, 66, 64, 68, 70, 72, 74],
    listedOnMarket: false,
    avatarSvg: generateSquadAvatar("Xyndicate Beta"),
  },
] as const;
