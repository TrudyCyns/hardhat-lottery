// Raffle
//SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import '@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol';
import '@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol';
import '@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol';

error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeepNotNeeded(
  uint256 currentBalance,
  uint256 numPlayers,
  uint256 lotteryState
);

/**
 * @title A sample Lottery Contract
 * @author Trudy
 * @notice This contract is for creating an untamperable decentralised smart contract
 * @dev This contract uses Chainlink VRF v2 to generate a random number and Chainlink Keepers to automate the lottery
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
  enum LotteryState {
    OPEN,
    CALCULATING
  }

  address payable[] private s_players; //payable since the winning address will be paid out
  uint256 private immutable i_entranceFee;
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  bytes32 private immutable i_gasLane;
  uint64 private immutable i_subscriptionId;
  uint32 private immutable i_callbackGasLimit;
  uint16 private constant REQUEST_CONFIRMATIONS = 3;
  uint32 private constant NUM_WORDS = 1;

  // Lottery varibles
  address private s_recentWinner;
  LotteryState private s_lotteryState;
  uint256 private s_lastTimeStamp = block.timestamp;
  uint256 private immutable i_interval;

  event LotteryEnter(address indexed player);
  event RequestedLotteryWinner(uint256 indexed requestId);
  event WinnerPicked(address indexed winner);

  constructor(
    uint256 entranceFee,
    address vrfCoordinatorV2,
    bytes32 gasLane,
    uint64 subscriptionId,
    uint32 callbackGasLimit,
    uint256 interval
  ) VRFConsumerBaseV2(vrfCoordinatorV2) {
    i_entranceFee = entranceFee;
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
    i_gasLane = gasLane;
    i_subscriptionId = subscriptionId;
    i_callbackGasLimit = callbackGasLimit;
    s_lotteryState = LotteryState.OPEN;
    i_interval = interval;
  }

  // Enter the lottery (paying some amount of ether)
  function enterLottery() public payable {
    // Require that msg.value > entranceFeear

    if (msg.value < i_entranceFee) {
      revert Lottery__NotEnoughETHEntered();
    }
    if (s_lotteryState != LotteryState.OPEN) {
      revert Lottery__NotOpen();
    }
    s_players.push(payable(msg.sender)); // Type cast msg.sender to address payable

    // Emit an event when we update a dynamic array or mapping: Naming syntax in function name reversed
    emit LotteryEnter(msg.sender);
  }

  /**
   * @dev This is the function the Chainlink Keeper nodes call
   * They look for the `upKeepNeeded` to return true
   * To be true:
   * 1. Time interval should have passed
   * 2. There should be at least one player and some ETH
   * 3. The subscription should have LINK
   * 4. Lottery should be in an open state
   */
  function checkUpkeep(
    bytes memory /*checkData*/ //So that it can be called within the contract
  )
    public
    view
    override
    returns (bool upkeepNeeded, bytes memory /*performData*/)
  {
    bool isOpen = (LotteryState.OPEN == s_lotteryState);
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasPlayers = (s_players.length > 0);
    bool hasBalance = (address(this).balance > 0);
    upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
  }

  // Pick a random winner (truly, verifiably random)
  function performUpkeep(bytes calldata /*checkData*/) external override {
    (bool upkeepNeeded, ) = checkUpkeep('');
    if (!upkeepNeeded) {
      revert Lottery__UpkeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_lotteryState)
      );
    }
    // Set Lottery State to be calculating so people can't join or
    s_lotteryState = LotteryState.CALCULATING;
    // Request the random number from the oracle
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gasLane, // or gasLane
      i_subscriptionId,
      REQUEST_CONFIRMATIONS,
      i_callbackGasLimit,
      NUM_WORDS
    );
    emit RequestedLotteryWinner(requestId);
  }

  // Fulfilling random numbers
  function fulfillRandomWords(
    uint256 /*requestId*/,
    uint256[] memory randomWords
  ) internal override {
    // Use Modulo function to select a winner from the array of randomWords. To get a winner, we get the remainder of the random number divided by the number of players
    uint256 indexOfWinner = randomWords[0] % s_players.length;
    address payable recentWinner = s_players[indexOfWinner];
    s_recentWinner = recentWinner;
    s_lotteryState = LotteryState.OPEN;
    s_players = new address payable[](0); // Reset the lottery for the next round
    s_lastTimeStamp = block.timestamp; // Reset the timestmp

    // Send the winner the money
    (bool success, ) = recentWinner.call{value: address(this).balance}("");
    if (!success) {
      revert Lottery__TransferFailed();
    }
    emit WinnerPicked(recentWinner);
  }

  function getEntranceFee() public view returns (uint256) {
    return i_entranceFee;
  }

  function getPlayers(uint256 index) public view returns (address) {
    return s_players[index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getLotteryState() public view returns (LotteryState) {
    return s_lotteryState;
  }

  function getNumberOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLatestTimestamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  // Since NUM_WORDS is a constant, we change the function to a pure function since it is not reading from storage
  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getRequestConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATIONS;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }

  function getSubscriptionId() public view returns (uint256) {
    return i_subscriptionId;
  }
}

// Winner selected automatically at certain intervals automatically
// chainlink oracle => Randommness, Automated Execution
