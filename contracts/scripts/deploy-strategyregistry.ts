import { ethers } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("StrategyRegistry");
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();

  await contract.waitForDeployment();

  console.log("StrategyRegistry deployed at:", await contract.getAddress());
  if (tx) {
    console.log("Deploy tx:", tx.hash);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
