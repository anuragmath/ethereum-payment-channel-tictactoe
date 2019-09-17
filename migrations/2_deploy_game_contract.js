var GameToken = artifacts.require("./GameToken.sol");
var GameContract = artifacts.require("./GameContract.sol");

module.exports = async function(deployer, network, accounts) {

  const wallet = accounts[0];

  await deployer.deploy(GameToken, "Game Token", "GMT", 18);

  const gameContract = await deployer.deploy(GameContract,
    GameToken.address, 1000);

  var gameToken = await GameToken.at(GameToken.address);

  await gameToken.addMinter(gameContract.address, {
      from: wallet,
      gas: 3000000
    });

};
