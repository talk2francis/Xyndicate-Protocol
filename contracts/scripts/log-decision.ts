import { ethers } from "hardhat";

const CONTRACT_ADDRESS = process.env.DECISION_LOG_ADDRESS || "0xC9E69be5ecD65a9106800E07E05eE44a63559F8b";

async function main() {
  if (!CONTRACT_ADDRESS) throw new Error("Set DECISION_LOG_ADDRESS");
  const contract = await ethers.getContractAt("DecisionLog", CONTRACT_ADDRESS);
  const tx = await contract.logDecision(
    "SYNDICATE_ALPHA",
    "Oracle→Analyst→Strategist→Executor",
    "ETH momentum confirmed. Confidence 0.81. Entering 15% position."
  );
  console.log("logDecision tx:", tx.hash);
  await tx.wait();
  console.log("logDecision confirmed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
