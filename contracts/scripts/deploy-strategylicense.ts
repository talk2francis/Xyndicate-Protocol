import { ethers } from "hardhat";

async function main() {
  const defaultPriceWei = ethers.parseEther("0.0002");
  const configuredPrice = process.env.STRATEGY_LICENSE_PRICE_WEI;
  const priceWei = configuredPrice ? BigInt(configuredPrice) : defaultPriceWei;

  const factory = await ethers.getContractFactory("StrategyLicense");
  const contract = await factory.deploy(priceWei);
  const tx = contract.deploymentTransaction();

  await contract.waitForDeployment();

  console.log("StrategyLicense deployed at:", await contract.getAddress());
  console.log("Price wei:", priceWei.toString());
  if (tx) {
    console.log("Deploy tx:", tx.hash);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
