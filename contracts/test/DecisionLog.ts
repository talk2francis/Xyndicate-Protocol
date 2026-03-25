import { expect } from "chai";
import { ethers } from "hardhat";

describe("DecisionLog", () => {
  it("stores records", async () => {
    const factory = await ethers.getContractFactory("DecisionLog");
    const log = await factory.deploy();
    await log.waitForDeployment();

    const tx = await log.recordDecision(ethers.id("plan-1"), "BUY_ETH");
    await tx.wait();

    const record = await log.getRecord(0);
    expect(record.decisionHash).to.equal(ethers.id("plan-1"));
    expect(record.metadata).to.equal("BUY_ETH");
  });
});
