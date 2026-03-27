import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type NarratorInput = {
  executorResult: any;
  strategistDecision: any;
};

export type NarratorDispatch = {
  card_summary: string;
  full_commentary: string;
  tweet_text: string;
};

export async function runNarrator(payload: NarratorInput): Promise<NarratorDispatch> {
  const systemPrompt = `You are the Narrator agent for Syndicate Protocol.\n` +
    `Convert an AI agent's on-chain trading decision into three outputs:\n` +
    `1. card_summary: One sentence, max 100 chars.\n` +
    `2. full_commentary: 3 sentences with context.\n` +
    `3. tweet_text: < 240 chars, punchy tone, include TX hash if present.\n` +
    `Respond with valid JSON only.`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message?.content || '{}');
  return parsed;
}
