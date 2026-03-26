import { createOkxClient } from "../lib/onchainOs";

const client = createOkxClient();
const projectId = process.env.OKX_PROJECT_ID;

export async function createSquadWallet(label: string) {
  if (!projectId) throw new Error("Missing OKX_PROJECT_ID");
  const { data } = await client.post(
    `/v1/projects/${projectId}/wallets`,
    {
      label,
      networks: ["xlayer"],
    }
  );
  return data;
}

export async function payEntryFee(amount: string, memo: string) {
  if (!projectId) throw new Error("Missing OKX_PROJECT_ID");
  const { data } = await client.post(
    `/v1/projects/${projectId}/x402/payments`,
    {
      amount,
      asset: "USDC",
      memo,
    }
  );
  return data;
}
