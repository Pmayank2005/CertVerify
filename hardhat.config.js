require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require("dotenv").config();

task("accounts", "Prints accounts on the selected network", async (_, { ethers }) => {
  const addresses = await Promise.all((await ethers.getSigners()).map((signer) => signer.getAddress()));
  for (const address of addresses) console.log(address);
});

const GANACHE_RPC_URL = process.env.GANACHE_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ganache: {
      url: GANACHE_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : "remote",
      chainId: 1337,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};
