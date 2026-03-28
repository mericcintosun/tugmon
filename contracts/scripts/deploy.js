const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying TugmonArena...\n");

  const TugmonArena = await hre.ethers.getContractFactory("TugmonArena");
  const arena = await TugmonArena.deploy();
  await arena.waitForDeployment();

  const address = await arena.getAddress();
  console.log(`✅ TugmonArena deployed to: ${address}`);

  const envPath = path.join(__dirname, "../../web/.env.local");
  if (fs.existsSync(envPath)) {
    let envData = fs.readFileSync(envPath, "utf8");
    envData = envData.replace(
      /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`
    );
    fs.writeFileSync(envPath, envData);
    console.log(`✅ Guncellendi: ${envPath}`);
  } else {
    console.log(`👉 web/.env.local bulunamadi, adresi manuel ekleyin.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
