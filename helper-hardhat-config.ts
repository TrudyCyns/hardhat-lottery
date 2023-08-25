import { ethers } from 'hardhat';

export interface networkConfigItem {
  name?: string;
  vrfCoordinatorV2?: string;
  blockConfirmations?: number;
  entranceFee?: string;
  subscriptionId?: string;
  gasLane?: string;
  keepersUpdateInterval?: string;
  callbackGasLimit?: string;
}

export interface networkConfigInfo {
  [key: string]: networkConfigItem;
}

export const networkConfig: networkConfigInfo = {
  31337: {
    name: 'localhost',
    subscriptionId: '588',
    gasLane:
      '0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c', // 30 gwei
    keepersUpdateInterval: '30',
    entranceFee: ethers.utils.parseEther('0.01').toString(), // 0.01 ETH
    callbackGasLimit: '500000', // 500,000 gas
  },
  hardhat: {},
  // Price Feed Address, values can be obtained at https://docs.chain.link/data-feeds/price-feeds/addresses
  // Default one is ETH/USD contract on Sepolia
  11155111: {
    name: 'sepolia',
    vrfCoordinatorV2: '0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625',
    blockConfirmations: 6,
    entranceFee: ethers.utils.parseEther('0.01').toString(),
    gasLane:
      '0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c',
    subscriptionId: '4763',
    callbackGasLimit: '500000',
    keepersUpdateInterval: '30',
  },
};

export const developmentChains = ['hardhat', 'localhost'];
