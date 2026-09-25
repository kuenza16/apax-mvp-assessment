import { expect } from "chai";
import { network } from "hardhat";

describe("APXGold", function () {
  async function fixture() {
    const { ethers } = await network.connect("hardhatMainnet");
    const [admin, minter, redeemer, alice, bob, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("APXGold", [admin.address]);
    await token.waitForDeployment();
    const mintRole = await token.MINTER_ROLE();
    const redeemRole = await token.REDEEMER_ROLE();
    await token.grantRole(mintRole, minter.address);
    await token.grantRole(redeemRole, redeemer.address);
    await token.setApproved(alice.address, true);
    await token.setApproved(bob.address, true);
    return { token, ethers, admin, minter, redeemer, alice, bob, outsider, mintRole, redeemRole };
  }

  it("deploys with expected metadata, admin, zero supply and separate roles", async function () {
    const { token, admin, mintRole, redeemRole } = await fixture();
    expect(await token.name()).to.equal("APX-Gold");
    expect(await token.symbol()).to.equal("APXG");
    expect(await token.decimals()).to.equal(18);
    expect(await token.totalSupply()).to.equal(0n);
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await token.hasRole(mintRole, admin.address)).to.equal(false);
    expect(await token.hasRole(redeemRole, admin.address)).to.equal(false);
  });

  it("rejects zero admin and zero compliance address", async function () {
    const { token, ethers } = await fixture();
    await expect(ethers.deployContract("APXGold", [ethers.ZeroAddress])).to.be.revertedWithCustomError(token, "InvalidAddress");
    await expect(token.setApproved(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(token, "InvalidAddress");
  });

  it("restricts compliance updates and emits their state", async function () {
    const { token, outsider } = await fixture();
    await expect(token.connect(outsider).setApproved(outsider.address, true)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.setApproved(outsider.address, true)).to.emit(token, "ComplianceUpdated").withArgs(outsider.address, true);
    expect(await token.isApproved(outsider.address)).to.equal(true);
  });

  it("rejects public and admin minting without minter role", async function () {
    const { token, outsider, alice } = await fixture();
    await expect(token.connect(outsider).mint(alice.address, 100n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.mint(alice.address, 100n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("mints to approved holders and emits standard mint Transfer", async function () {
    const { token, minter, alice, ethers } = await fixture();
    await expect(token.connect(minter).mint(alice.address, 100n)).to.emit(token, "Transfer").withArgs(ethers.ZeroAddress, alice.address, 100n);
    expect(await token.balanceOf(alice.address)).to.equal(100n);
    expect(await token.totalSupply()).to.equal(100n);
  });

  it("rejects minting to unapproved or zero addresses", async function () {
    const { token, minter, outsider, ethers } = await fixture();
    await expect(token.connect(minter).mint(outsider.address, 100n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(outsider.address);
    await expect(token.connect(minter).mint(ethers.ZeroAddress, 100n)).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
  });

  it("transfers between approved accounts", async function () {
    const { token, minter, alice, bob } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).transfer(bob.address, 40n);
    expect(await token.balanceOf(alice.address)).to.equal(60n);
    expect(await token.balanceOf(bob.address)).to.equal(40n);
    expect(await token.totalSupply()).to.equal(100n);
  });

  it("rejects an unapproved recipient", async function () {
    const { token, minter, alice, outsider } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await expect(token.connect(alice).transfer(outsider.address, 1n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(outsider.address);
  });

  it("revocation blocks an existing holder's future sends and receives", async function () {
    const { token, minter, alice, bob } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.setApproved(alice.address, false);
    await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(alice.address);
    await expect(token.connect(bob).transfer(alice.address, 0n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(alice.address);
    expect(await token.balanceOf(alice.address)).to.equal(100n);
  });

  it("supports compliant transferFrom with allowance accounting", async function () {
    const { token, minter, alice, bob, outsider } = await fixture();
    await token.setApproved(outsider.address, true);
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(outsider.address, 60n);
    await token.connect(outsider).transferFrom(alice.address, bob.address, 40n);
    expect(await token.allowance(alice.address, outsider.address)).to.equal(20n);
    expect(await token.balanceOf(bob.address)).to.equal(40n);
  });

  it("rejects unapproved transferFrom operators even with allowance", async function () {
    const { token, minter, alice, bob, outsider } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(outsider.address, 100n);
    await expect(token.connect(outsider).transferFrom(alice.address, bob.address, 10n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(outsider.address);
  });

  it("cannot bypass sender or receiver revocation through transferFrom", async function () {
    const { token, minter, alice, bob, outsider } = await fixture();
    await token.setApproved(outsider.address, true);
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(outsider.address, 100n);
    for (const holder of [alice, bob]) {
      await token.setApproved(holder.address, false);
      await expect(token.connect(outsider).transferFrom(alice.address, bob.address, 10n)).to.be.revertedWithCustomError(token, "AccountNotApproved").withArgs(holder.address);
      expect(await token.allowance(alice.address, outsider.address)).to.equal(100n);
      await token.setApproved(holder.address, true);
    }
  });

  it("restricts pause/unpause to admin", async function () {
    const { token, minter } = await fixture();
    await expect(token.connect(minter).pause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await token.pause();
    await expect(token.connect(minter).unpause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("pause blocks transfer, transferFrom, mint and burn; unpause restores movement", async function () {
    const { token, minter, redeemer, alice, bob } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(redeemer.address, 30n);
    await token.connect(alice).approve(bob.address, 10n);
    await token.pause();
    expect(await token.paused()).to.equal(true);
    await expect(token.connect(alice).transfer(bob.address, 10n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(bob).transferFrom(alice.address, bob.address, 10n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(minter).mint(alice.address, 10n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    await expect(token.connect(redeemer).burnFrom(alice.address, 10n)).to.be.revertedWithCustomError(token, "EnforcedPause");
    expect(await token.allowance(alice.address, redeemer.address)).to.equal(30n);
    await token.unpause();
    await token.connect(alice).transfer(bob.address, 10n);
    await token.connect(minter).mint(alice.address, 10n);
    await token.connect(redeemer).burnFrom(alice.address, 10n);
    expect(await token.totalSupply()).to.equal(100n);
  });

  it("authorized redemption burns consented amount and reduces supply", async function () {
    const { token, minter, redeemer, alice, ethers } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(redeemer.address, 40n);
    await expect(token.connect(redeemer).burnFrom(alice.address, 40n)).to.emit(token, "Transfer").withArgs(alice.address, ethers.ZeroAddress, 40n);
    expect(await token.balanceOf(alice.address)).to.equal(60n);
    expect(await token.totalSupply()).to.equal(60n);
    expect(await token.allowance(alice.address, redeemer.address)).to.equal(0n);
  });

  it("rejects unauthorized burn despite allowance", async function () {
    const { token, minter, alice, outsider } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(outsider.address, 100n);
    await expect(token.connect(outsider).burnFrom(alice.address, 10n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.connect(alice).burnFrom(alice.address, 10n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("rejects burn without sufficient consent or balance", async function () {
    const { token, minter, redeemer, alice } = await fixture();
    await token.connect(minter).mint(alice.address, 10n);
    await expect(token.connect(redeemer).burnFrom(alice.address, 1n)).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    await token.connect(alice).approve(redeemer.address, 20n);
    await expect(token.connect(redeemer).burnFrom(alice.address, 20n)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    expect(await token.allowance(alice.address, redeemer.address)).to.equal(20n);
  });

  it("revocation freezes burns too; holder can revoke consent while paused", async function () {
    const { token, minter, redeemer, alice } = await fixture();
    await token.connect(minter).mint(alice.address, 100n);
    await token.connect(alice).approve(redeemer.address, 40n);
    await token.setApproved(alice.address, false);
    await expect(token.connect(redeemer).burnFrom(alice.address, 40n)).to.be.revertedWithCustomError(token, "AccountNotApproved");
    await token.pause();
    await token.connect(alice).approve(redeemer.address, 0n);
    expect(await token.allowance(alice.address, redeemer.address)).to.equal(0n);
  });

  it("admin can grant/revoke minter and redeemer; outsiders cannot manage roles", async function () {
    const { token, minter, redeemer, alice, outsider, mintRole, redeemRole } = await fixture();
    await expect(token.connect(outsider).grantRole(mintRole, outsider.address)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await token.revokeRole(mintRole, minter.address);
    await expect(token.connect(minter).mint(alice.address, 10n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await token.grantRole(mintRole, outsider.address);
    await token.connect(outsider).mint(alice.address, 10n);
    await token.connect(alice).approve(redeemer.address, 10n);
    await token.revokeRole(redeemRole, redeemer.address);
    await expect(token.connect(redeemer).burnFrom(alice.address, 10n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });
});
