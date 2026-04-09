import { ethers } from "hardhat";

async function main() {
  const entryFee = process.env.SEASON_V2_ENTRY_FEE_WEI || "1000000000000000";
  const seasonId = process.env.SEASON_V2_ID || "SEASON_001";

  const factory = await ethers.getContractFactory("SeasonManagerV2");
  const contract = await factory.deploy(entryFee, seasonId);
  const tx = contract.deploymentTransaction();

  await contract.waitForDeployment();

  console.log("SeasonManagerV2 deployed at:", await contract.getAddress());
  if (tx) {
    console.log("Deploy tx:", tx.hash);
  }
  console.log("Entry fee wei:", entryFee);
  console.log("Season ID:", seasonId);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
