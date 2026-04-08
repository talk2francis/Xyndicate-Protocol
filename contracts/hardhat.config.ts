import 'dotenv/config';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const rpcUrl = process.env.X_LAYER_RPC || process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';
const deployKey = process.env.SYNDICATE_PRIVATE_KEY || process.env.STRATEGIST_KEY || '';

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    xlayer: {
      url: rpcUrl,
      accounts: deployKey ? [deployKey] : []
    }
  },
  paths: {
    sources: "./src",
    tests: "./test"
  }
};

export default config;
