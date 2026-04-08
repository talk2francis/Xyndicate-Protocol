import { NextResponse } from "next/server";

const BASE = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend";

export async function GET() {
  try {
    const [deploymentsRes, txhashesRes, agentPaymentsRes] = await Promise.all([
      fetch(`${BASE}/deployments.json`, { next: { revalidate: 30 } }),
      fetch(`${BASE}/txhashes.json`, { next: { revalidate: 30 } }),
      fetch(`${BASE}/agentpayments.json`, { next: { revalidate: 30 } }),
    ]);

    if (!deploymentsRes.ok || !txhashesRes.ok || !agentPaymentsRes.ok) {
      throw new Error("Failed to fetch proof artifacts");
    }

    const deployments = await deploymentsRes.json();
    const txhashes = await txhashesRes.json();
    const agentPayments = await agentPaymentsRes.json();

    const deploymentItems = Object.entries(deployments || {})
      .filter(([, value]) => value && typeof value === "object")
      .flatMap(([key, value]: [string, any]) => {
        const items = [] as any[];
        if (value.deployTx) {
          items.push({
            type: "deployment",
            label: key,
            txHash: value.deployTx,
            address: value.address || null,
            timestamp: value.timestamp || 0,
          });
        }
        return items;
      });

    const decisionItems = Object.entries(txhashes || {}).map(([index, txHash]) => ({
      type: "decision",
      label: `Decision ${index}`,
      txHash,
      timestamp: Number(index) || 0,
    }));

    const paymentItems = (Array.isArray(agentPayments) ? agentPayments : []).map((payment: any) => ({
      type: "payment",
      label: `${payment.from} → ${payment.to}`,
      txHash: payment.txHash,
      amount: payment.amount,
      timestamp: Number(payment.timestamp || 0),
      status: payment.status || null,
    }));

    const proofs = [...deploymentItems, ...decisionItems, ...paymentItems].sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ proofs }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load proofs" }, { status: 500 });
  }
}
