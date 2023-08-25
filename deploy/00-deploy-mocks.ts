import { network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { developmentChains } from '../helper-hardhat-config';

const BASE_FEE = '250000000000000000'; // 0.25 LINK - cost of requesting a random number
const GAS_PRICE_LINK = 1e9; // Calculated value based on the gas price of the chain, Chainlink nodes are what pay this fee. Price of the request changes based on the price of gas

const deployMocks = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const args = [BASE_FEE, GAS_PRICE_LINK];
  if (developmentChains.includes(network.name)) {
    log('Local network detected. Deploying Mocks...');

    // deploy mock VRFCoordiator
    await deploy('VRFCoordinatorV2Mock', {
      from: deployer,
      log: true,
      args: args,
    });

    log('Mocks Deployed!');
    log('======================================');
  }
};

export default deployMocks;
deployMocks.tags = ['all', 'mocks'];
