import 'dotenv/config';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    xlayer: {
      url: process.env.X_LAYER_RPC || 'https://rpc.xlayer.tech',
      accounts: process.env.SYNDICATE_PRIVATE_KEY ? [process.env.SYNDICATE_PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./src",
    tests: "./test"
  }
};

export default config;
