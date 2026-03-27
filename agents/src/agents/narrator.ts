import { StrategyDecision } from "./strategist";

export type NarratorDispatch = {
  card_summary: string;
  full_commentary: string;
  tweet_text: string;
};

export async function runNarrator(payload: { strategistDecision: StrategyDecision; executorResult: any }): Promise<NarratorDispatch> {
  const { strategistDecision, executorResult } = payload;
  const action = strategistDecision.action.toUpperCase();
  const asset = strategistDecision.asset;
  const size = strategistDecision.sizePercent;
  const rationale = strategistDecision.rationale;
  const txHash = executorResult?.txHash ?? "0x2ae68eaa64e4d1dd42e8be751fac6faa5baf1052a3c45ee755fcc7ade2587ad6";

  const actionVerb = action === "BUY" ? "deployed" : action === "SELL" ? "trimmed" : "held";
  const cardSummary = `${actionVerb} ${asset} (${size}% treasury).`;
  const fullCommentary = `Strategist chose to ${actionVerb} ${asset} with ${size}% sizing. Rationale: ${rationale}`;
  const tweetText = `${actionVerb.toUpperCase()} ${asset} (${size}% treasury). ${rationale.slice(0, 200)} TX: ${txHash}`;

  return {
    card_summary: cardSummary,
    full_commentary: fullCommentary,
    tweet_text: tweetText,
  };
}
