import { expect } from "chai";
import { ethers } from "hardhat";

describe("SeasonManager", () => {
  it("enrolls squads", async () => {
    const [owner, squad] = await ethers.getSigners();

    // mock x402 hub that records payment calls
    const hubFactory = await ethers.getContractFactory("X402Mock");
    const hub = await hubFactory.deploy();
    await hub.waitForDeployment();

    const managerFactory = await ethers.getContractFactory("SeasonManager");
    const manager = await managerFactory.deploy(await hub.getAddress(), ethers.parseEther("1"));
    await manager.waitForDeployment();

    await expect(manager.connect(squad).enroll(squad.address)).to.emit(manager, "SquadEnrolled");
    const data = await manager.squads(await squad.getAddress());
    expect(data.active).to.equal(true);
  });
});
