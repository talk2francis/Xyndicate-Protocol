import OpenAI from "openai";

type OracleReport = { pair: string; price: number; change24h: number };

export type AnalystAssessment = {
  opportunities: { asset: string; type: string; rationale: string; confidence: number }[];
  risks: { description: string; severity: number }[];
  recommendation: "act" | "wait" | "exit";
  topAsset: string;
  confidenceScore: number;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runAnalyst(report: OracleReport): Promise<AnalystAssessment> {
  const systemPrompt = `You are the Analyst agent in the Syndicate Protocol multi-agent system.\n` +
    `You receive structured market data from the Oracle agent and produce an opportunity assessment.\n` +
    `You MUST respond with valid JSON only. No explanation outside the JSON.\n` +
    `Schema: {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(report) }
    ]
  });

  return JSON.parse(completion.choices[0].message?.content || '{}');
}
