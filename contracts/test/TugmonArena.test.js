const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TugmonArena", function () {
  async function deploy() {
    const Factory = await ethers.getContractFactory("TugmonArena");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    return c;
  }

  it("join then pull increases team score", async function () {
    const c = await deploy();
    const [a] = await ethers.getSigners();
    await c.connect(a).join(1, "alice");
    await c.connect(a).pull();
    const rs = await c.redScore();
    expect(rs > 0n).to.equal(true);
  });

  it("boost reverts for non-booster roles", async function () {
    const c = await deploy();
    const [a] = await ethers.getSigners();
    await c.connect(a).join(1, "bob");
    const info = await c.getPlayerInfo(a.address);
    const role = info[1];
    if (Number(role) !== 3) {
      await expect(c.connect(a).boost()).to.be.revertedWith("Only Boosters can boost");
    }
  });

  it("sabotage reverts for non-saboteur roles", async function () {
    const c = await deploy();
    const [a] = await ethers.getSigners();
    await c.connect(a).join(2, "carol");
    const info = await c.getPlayerInfo(a.address);
    const role = info[1];
    if (Number(role) !== 2) {
      await expect(c.connect(a).sabotage()).to.be.revertedWith("Only Saboteurs can sabotage");
    }
  });

  it("enforces special cooldown for booster", async function () {
    const c = await deploy();
    const signers = await ethers.getSigners();
    let booster;
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      await c.connect(s).join(1, `u${i}`);
      const r = await c.getPlayerInfo(s.address);
      if (Number(r[1]) === 3) {
        booster = s;
        break;
      }
    }
    if (!booster) {
      this.skip();
    }
    await c.connect(booster).boost();
    await expect(c.connect(booster).boost()).to.be.revertedWith("Special cooldown");
  });

  it("resetGame clears scores and emits GameReset", async function () {
    const c = await deploy();
    const [a, b] = await ethers.getSigners();
    await c.connect(a).join(1, "r1");
    await c.connect(b).join(2, "r2");
    await c.connect(a).pull();
    await expect(c.resetGame()).to.emit(c, "GameReset");
    expect(await c.redScore()).to.equal(0n);
    expect(await c.blueScore()).to.equal(0n);
  });
});
