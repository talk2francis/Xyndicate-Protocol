import { ethers } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("SeasonManager");
  const contract = await factory.deploy(ethers.ZeroAddress, ethers.parseEther("0.001"));
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  console.log("SeasonManager deployed at:", await contract.getAddress());
  if (tx) console.log("Deploy tx:", tx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
