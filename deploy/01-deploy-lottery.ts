import { ethers, network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { developmentChains, networkConfig } from '../helper-hardhat-config';
import verify from '../utils/verify';

const deployLottery = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId as number;
  let vrfCoordinatorV2Address, subscriptionId;

  const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther('2');

  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Mock = await ethers.getContract(
      'VRFCoordinatorV2Mock'
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;

    // Create a subscripton
    const txnResponse = await vrfCoordinatorV2Mock.createSubscription();
    const txnReceipt = await txnResponse.wait(1);
    subscriptionId = txnReceipt.events[0].args.subId;

    // Fund the subscription. You woul need LINK on a real network but not on a mock
    vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT);
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]['vrfCoordinatorV2'];
    subscriptionId = networkConfig[chainId]['subscriptionId'];
  }

  const entranceFee = networkConfig[chainId]['entranceFee'];
  const gasLane = networkConfig[chainId]['gasLane'];
  const callbackGasLimit = networkConfig[chainId]['callbackGasLimit'];
  const keepersUpdateInterval = networkConfig[chainId]['keepersUpdateInterval'];

  const args = [
    entranceFee,
    vrfCoordinatorV2Address,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    keepersUpdateInterval,
  ];

  const lottery = await deploy('Lottery', {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: 5, // blockConfirmations not found on network from hardhat type
  });

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log('Verifying...');
    await verify(lottery.address, args);
  }
  log('----------------------------------------------------');
};

export default deployLottery;
deployLottery.tags = ['all', 'lottery'];
