import { ethers, getNamedAccounts, network } from 'hardhat';
import { developmentChains } from '../../helper-hardhat-config';
import { BigNumber } from 'ethers';
import { Lottery } from '../../typechain-types';
import { assert, expect } from 'chai';

developmentChains.includes(network.name)
  ? describe.skip
  : describe('Lottery Staging Tests', function () {
      let lottery: Lottery;
      let lotteryEntranceFee: BigNumber;
      let deployer: string;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        lottery = await ethers.getContract('Lottery', deployer);
        lotteryEntranceFee = await lottery.getEntranceFee();
      });

      describe('fulfillRandomWords', function () {
        it('Should work with live Chainlink VRF and get us a random winner', async function () {
          // All we need to do is enter the raffle
          const startingTimestamp = await lottery.getLatestTimestamp();
          const accts = await ethers.getSigners();

          await new Promise<void>(async (resolve, reject) => {
            // Set up a listener before entering the lottery incase the blockchain is moving very fast
            lottery.once('WinnerPicked', async () => {
              console.log('WinnerPicked event fired');
              try {
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const winnerEndingBalance = await accts[0].getBalance();
                const endingTimestamp = await lottery.getLatestTimestamp();

                // Add asserts here
                await expect(lottery.getPlayers(0)).to.be.reverted; // Because there will be no players
                assert.equal(recentWinner.toString(), accts[0].address);
                assert.equal(lotteryState.toString(), '0');
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                );
                assert(endingTimestamp.gt(startingTimestamp));
                resolve()
              } catch (e) {
                console.log('Error: ', e);
                reject(e);
              }
            });

            // Enter the lottery
            await lottery.enterLottery({ value: lotteryEntranceFee });
            const winnerStartingBalance = await accts[0].getBalance();
          });
        });
      });
    });
