import { deployments, ethers, getNamedAccounts, network } from 'hardhat';
import { developmentChains, networkConfig } from '../../helper-hardhat-config';
import { Lottery, VRFCoordinatorV2Mock } from '../../typechain-types';
import { assert, expect } from 'chai';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

!developmentChains.includes(network.name)
  ? describe.skip
  : describe('Lottery', async () => {
      let lottery: Lottery,
        vrfCoordinatorV2Mock: VRFCoordinatorV2Mock,
        lotteryEntranceFee: BigNumber,
        player: SignerWithAddress,
        accounts: SignerWithAddress[],
        interval: number;
      const chainId = network.config.chainId as number;

      beforeEach(async () => {
        accounts = await ethers.getSigners();
        player = accounts[0];
        const { deployer } = await getNamedAccounts();
        await deployments.fixture(['all']);
        lottery = await ethers.getContract('Lottery', deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          'VRFCoordinatorV2Mock',
          deployer
        );
        const subId = lottery.getSubscriptionId();
        await vrfCoordinatorV2Mock.addConsumer(subId, lottery.address); // Add a consumer to the mock VRF Coordinator
        lotteryEntranceFee = await lottery.getEntranceFee();
        interval = (await lottery.getInterval()).toNumber();
      });

      // Ideally keep each `it` with just one assert
      describe('constructor', () => {
        it('Should initialise the lottery correctly', async () => {
          const lotteryState = await lottery.getLotteryState();
          const interval = await lottery.getInterval();
          assert.equal(lotteryState.toString(), '0');
          assert.equal(
            interval.toString(),
            networkConfig[chainId]['keepersUpdateInterval']
          );
        });
      });

      describe('enterLottery', () => {
        it('Should revert when you do not pay enough', async () => {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            'Lottery__NotEnoughETHEntered'
          );
        });

        it('Should record players when they enter', async () => {
          // Enter Lottery
          await lottery.enterLottery({ value: lotteryEntranceFee });
          // Get the players on the lottery
          const playerFromContract = await lottery.getPlayers(0);
          // Assert
          assert.equal(player.address, playerFromContract);
        });

        it('Should emit an event on enter', async () => {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, 'LotteryEnter');
        });

        it('Should not allow entrance when lottery is calculating', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });

          // Get lottery into a calculating state. Pretend to be the chainkeepers and return true on check upkeep then trigger perform upkeep. Hh comes with function that allows us to manipulate the network to do what we need it to do.
          await network.provider.send('evm_increaseTime', [interval + 1]); // Increase time to cover the interval
          await network.provider.send('evm_mine', []); // Mine a block
          // Due to the above executions, checkUpkeep should return true. then we can act as Chinlink Keepers and call performUpkeep to turn the state to calculating
          await lottery.performUpkeep([]);
          // Now the lottery is in a calculating state, we should not be able to enter
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith('Lottery__NotOpen');
        });
      });

      describe('checkUpkeep', () => {
        it("Should return false if people haven't sent any eth", async () => {
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.send('evm_mine', []);

          // running checkUpkeep([]) kicks off a transaction but that is not what we want. We want to simulate sending the transaction and see what is returned. we can do this with callstatic
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("Should return false if Lottery isn't open", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.send('evm_mine', []);
          await lottery.performUpkeep([]);
          const lotteryState = await lottery.getLotteryState();
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);

          assert.equal(lotteryState.toString(), '1');
          assert.equal(upkeepNeeded, false);
        });

        it("Should return false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval - 10]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it('returns true if enough time has passed, has players, eth, and is open', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep('0x');
          assert(upkeepNeeded);
        });
      });

      describe('performUpkeep', () => {
        it('Should only run if checkUpkeep is true', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.send('evm_mine', []);
          const tx = await lottery.performUpkeep([]); // [] and "0x" are the same

          assert(tx);
        });

        it('Should revert when checkUpkeep is false', async () => {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            'Lottery__UpkeepNotNeeded' // Putting the error name alone is enough despite it being thrown with parameters
          );
        });

        it('Should update the Lottery State, emits and event and calls the VRFCoordinator', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.send('evm_mine', []);

          const txResponse = await lottery.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const lotteryState = await lottery.getLotteryState();
          const requestId = txReceipt!.events![1].args!.requestId; // We can also use the emitted requestId from the VRFCoordinator.

          assert(requestId.toNumber() > 0);
          assert(lotteryState == 1);
        });
      });

      describe('fulfillRandomWords', () => {
        // Someone needs to have entered the lottery before we run any of the tests
        beforeEach(async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          await network.provider.send('evm_increaseTime', [interval + 1]);
          await network.provider.send('evm_mine', []);
        });

        it('Should only be called after performUpkeep', async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith('nonexistent request');
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith('nonexistent request');
        });

        it('Should pick a winner, reset the lottery and sends money', async () => {
          const additonalPlayers = 3; // Extra people eto enter hte lottery
          const startingAcctIndex = 1; // Since deployer is 0
          const accounts = await ethers.getSigners();
          // For loop to enter players into the lottery making a total of 4 players
          for (
            let i = startingAcctIndex;
            i < startingAcctIndex + additonalPlayers;
            i++
          ) {
            const acctConnectedLottery = lottery.connect(accounts[i]);
            await acctConnectedLottery.enterLottery({
              value: lotteryEntranceFee,
            });
          }
          const startingTimestamp = await lottery.getLatestTimestamp();

          // performUpkeep (mock chainlink keepers) => kickoff fulfillRandomWords (mock chainlink VRF) then we can check the results. Simulate our wait for the fulfillRandomWords to be called. We set up a listener an make sure test does not finish before the listener is done. hence create a new promise
          await new Promise<void>(async (resolve, reject) => {
            // Once the WinnerPicked event is emitted, do the following. If the event does not fire in 200s, the test will fail
            lottery.once('WinnerPicked', async () => {
              console.log('Found the event...');
              try {
                const lotteryState = await lottery.getLotteryState();
                const endingTimestamp = await lottery.getLatestTimestamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();

                assert.equal(numPlayers.toString(), '0');
                assert.equal(lotteryState.toString(), '0');
                assert(endingTimestamp.gt(startingTimestamp));
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance
                    .add(
                      lotteryEntranceFee
                        .mul(additonalPlayers)
                        .add(lotteryEntranceFee)
                    )
                    .toString()
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });

            // We put the code in the promise because outside the listener will never fire
            const tx = await lottery.performUpkeep([]);
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events![1].args!.requestId,
              lottery.address
            ); // requestId, randomness, consumerContractAddress
          });
        });
      });
    });
