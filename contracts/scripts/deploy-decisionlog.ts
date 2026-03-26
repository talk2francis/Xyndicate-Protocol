import { ethers } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("DecisionLog");
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  console.log("DecisionLog deployed at:", await contract.getAddress());
  if (tx) {
    console.log("Deploy tx:", tx.hash);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
