var socket = require('socket.io-client')('http://localhost:3000');
var inquirer = require('inquirer');
const ora = require('ora');
var figlet = require('figlet');
const chalk = require('chalk');
const boxen = require('boxen');

const GameContractABI = require('./build/contracts/GameContract.json');
const GameTokenABI = require('./build/contracts/GameToken.json');

const Web3 = require('web3');

const GameContractAddress = "0x8DbaE993c385F3Dd4A4E251b709389a596b4C1C0";
const GameTokenAddress = "0x7265534F82C7ff41A12E2A49F2078BC222A149Fe";

const GameTokenRate = 1000;

var web3 = new Web3('http://localhost:8545');

const spinner = ora({
  spinner: {
    "interval": 125,
		"frames": [
			"∙∙∙",
			"●∙∙",
			"∙●∙",
			"∙∙●",
			"∙∙∙"
		]
  }
});

let isPlayer1 = false;
let isPlayer2 = false;
let gameId = null;
let board = new Array(9);

socket.on('disconnect', function() {
    socket.emit('disconnect');
});

socket.on('connect', async () => {

    console.log(chalk.red(figlet.textSync('Welcome To Tic-Tac-Toe', {
      font: 'standard',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    })));

    spinner.succeed(chalk.green('You are now connected to game server'));

    console.log("\n");
    console.log("================================================");
    console.log(chalk.blue.bgWhite.bold("Setup Ethereum Account"));
    console.log("================================================");

    await initializePlayer();

    console.log("\n");
    console.log("================================================");
    console.log(chalk.blue.bgWhite.bold("Buy Game Tokens"));
    console.log("================================================");
    await buyGameTokens();

    console.log("\n");
    console.log("================================================");
    console.log(chalk.blue.bgWhite.bold("Setup Game"));
    console.log("================================================");
    await initializeGame();
    //console.log(socket);
});

socket.on('message', async (data) => {
  console.log("\n", chalk.red(data));
});

socket.on('Waiting', async (data) => {
  spinner.start(chalk.red(data));
});

socket.on('Round-Lost', async(data) => {
  spinner.stop();
  console.log(chalk.red.bold.underline('You have Lost this round.'));
});

socket.on('Round-Tie', async(data) => {
  spinner.stop();
  console.log(chalk.blue.bold.underline('This round was a Tie.'));
});

socket.on('Player-2-Joined', async (data) => {
    spinner.succeed(chalk.green("Player 2 has joined. Starting the game"));
});

socket.on('Opponent-Disconnected', async () => {
  spinner.stop();
  console.log(chalk.red.bold('\n\nYour opponent has diconnected his game'));
  spinner.start(chalk.red("Settling Payments"));
  await settlePayments(gameId);
  spinner.succeed(chalk.green("Payments settled"));
  process.exit(0);
});

socket.on('NewGames-List', async(data) => {

  console.log(chalk.cyan.bold("Available Games"))
  data.forEach(game => {
    console.log("\n", game);
  });
  console.log("\n");

  await joinNewGame(data);

});

socket.on('Your-Turn', async (message) => {
  spinner.stop();
  board = message.board.slice();

  console.log(chalk.blue("-----Current Board------"));
  printBoard();

  await playYourTurn(message);

});

socket.on('End-Game', async (message) => {

  console.log(chalk.cyan.bold.underline("\n\nThis Game has ended."));
  console.log(chalk.cyan("\nYou Won " + message.wins + " rounds"));
  spinner.start(chalk.red("Settling Payments"));
  await settlePayments(message.gameId);
  spinner.succeed(chalk.green("Payments settled"));
  process.exit(0);
});

async function initializePlayer() {

  var answer = await inquirer.prompt({
    type: 'list',
    name: 'wallet',
    message: 'Ethereum account is required to play this game. Select one option',
    choices: [
      {
        key: 'c',
        name: 'Create new wallet',
        value: 'createWallet'
      },
      {
        key: 'o',
        name: 'Open existing wallet',
        value: 'openWallet'
      }
    ]
  });

  if(answer.wallet == 'createWallet'){
    spinner.start(chalk.red("Creating new wallet"));
    player = await createWallet();
    spinner.succeed(chalk.green("New wallet is created"));
    console.log("***************");
    console.log(chalk.red.bold(" address: ", player.address, "\n", "privateKey: ", player.privateKey));
    console.log("***************");
  } else {
    answer = await inquirer.prompt({
      type: 'password',
      name: 'privateKey',
      message: 'Enter the wallet private key to unlock'
    })
    spinner.start(chalk.red("Unlocking your wallet"));
    player = await unlockWallet(answer.privateKey);
    spinner.succeed(chalk.green("Your wallet is unlocked"));
    console.log("***************");
    console.log(chalk.red.bold(" address: ", player.address));
    console.log("***************");
  }

}

async function buyGameTokens() {

  var answer = await inquirer.prompt({
    type: 'input',
    name: 'gameTokens',
    message: 'Enter the amount of Game Tokens (GMT) to buy (1 ETH = 1000 GMT)'
  });

  try {
    spinner.start(chalk.red('Buying game tokens'));
    await buyTokens(answer.gameTokens);
  } catch (e) {
    spinner.fail(chalk.red("Something Failed"));
    console.log(e);
  }

}

async function initializeGame() {

  var answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'game',
      message: 'Select one option',
      choices: [
        {
          key: 'c',
          name: 'Create New Game',
          value: 'newGame'
        },
        {
          key: 'j',
          name: 'Join Game',
          value: 'joinGame'
        }
      ]
    }
  ]);

  if(answer.game === 'newGame'){
    await createNewGame();
  } else {

    socket.emit('Get-NewGames-List', socket.id);

  }

}


async function createNewGame() {

  var answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'rounds',
      message: 'Enter number of rounds for game'
    },
    {
      type: 'input',
      name: 'bet',
      message: 'Enter your bet for each round'
    }
  ]);

  let game = {
    gameId: '_' + Math.random().toString(36).substr(2, 9),
    rounds: answer.rounds,
    bet: answer.bet,
    player: player.address,
    playerId: socket.id
  }

  spinner.start(chalk.red('Creating New Game'));
  await approveGameTokens(game.bet * game.rounds);
  spinner.text = "Game Tokens Approved";
  await createGameChannel(game);
  spinner.text = "Game Channel Created";
  isPlayer1 = true;
  gameId = game.gameId;

  socket.emit('Created-NewGame', game);

  spinner.succeed(chalk.green('Your Game is Successfully Created with game Id: ', game.gameId));
  spinner.start('Wait for other player to join');
}

async function joinNewGame(games) {

  var answer = await inquirer.prompt({
      type: 'input',
      name: 'gameId',
      message: 'Enter Game Id to join',
      validate: function(value) {

        if((games.filter(game => game.GameId === value)).length > 0){
          return true;
        }

        return 'Please enter a valid game id'
      }

    });

  let game = games.filter(game => game.GameId === answer.gameId);

  spinner.start(chalk.red('Joining New Game'));
  await approveGameTokens(game[0].Bet * game[0].Rounds);
  spinner.text = "Game Tokens Approved";
  await joinGameChannel(game[0]);
  spinner.text = "Game Channel Joined";
  isPlayer2 = true;
  gameId = game[0].GameId;

  socket.emit('Joined-NewGame', {
    gameId: game[0].GameId,
    playerAddress: player.address,
    playerId: socket.id
  });

  spinner.succeed(chalk.green('Your have successfully joined game with game Id: ', game[0].GameId));

}

async function playYourTurn(game) {

  var answer = await inquirer.prompt({
      type: 'input',
      name: 'pos',
      message: 'Enter your move',
      validate: function(value) {

        if(board[value] === '0x0000000000000000000000000000000000000000'){
            return true;
        }

        return 'Please enter a valid move';

      }
  });

  board[answer.pos] = player.address;

  const messageHash = await generateHash(game.id, board, game.activeRound);
  const signedMessage = await signMessage(messageHash);

  const data = {
    signedMessage: signedMessage,
    signer: player.address,
    move: answer.pos,
    gameId: game.id
  }

  console.log(chalk.blue("-----Updated Board------"));
  printBoard();

  if(checkWin(board, player.address)){

      console.log(chalk.green.bold.underline("You have Won this round"));
      spinner.start(chalk.red("Updating win on Game contract"));
      await updateOnRoundWin(game.lastMoveSignature.signature, game.signer, game.id, game.board, answer.pos, game.activeRound);
      spinner.succeed(chalk.green("Round Win Updated on Game Contract"))
      socket.emit('Round-Won', data);
  } else if(checkTie(board)){
      socket.emit('Round-Tie', data);
  } else {
    if(isPlayer1)
      socket.emit('Player-1-Played', data);
    else
      socket.emit('Player-2-Played', data);
  }
}



function buyTokens(amount) {

  return new Promise( async (resolve, reject) => {

    var price = web3.utils.toWei(amount.toString(), 'ether')/GameTokenRate;

    var rawTx = {
     to: GameContractAddress,
     value: web3.utils.toHex(price),
     gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      spinner.succeed(chalk.green('Game Tokens purchased'));
      resolve(receipt);
    }).on('error', (error) => {
      spinner.fail(chalk.red("Something Failed"));
      console.log(error);
    });
  })
}

function createWallet() {
  return new Promise(async (resolve, reject) => {

    var account = await web3.eth.accounts.create();

    resolve(account);
  });
}

function unlockWallet(privateKey) {
  return new Promise(async (resolve, reject) =>{

    var account = await web3.eth.accounts.privateKeyToAccount(privateKey);

    resolve(account);
  });
}


function generateHash(gameId, board, activeRound) {

  return new Promise(async(resolve, reject) => {

    const hash = web3.utils.soliditySha3({
      type: 'bytes32',
      value: web3.utils.fromAscii(gameId)
    }, {
      type: 'address[9]',
      value: board
    },{
      type: 'uint256',
      value: activeRound
    });

    resolve(hash);
  });
}


function signMessage(hash) {

  return new Promise(async(resolve, reject) => {
    const sign = await player.sign(hash);
    resolve(sign);
  })
}

function approveGameTokens(amount) {

  return new Promise(async(resolve, reject) => {

    const contract = new web3.eth.Contract(GameTokenABI.abi, GameTokenAddress, {
      from: player.address
    });


    const rawTx = {
      to: GameTokenAddress,
      data: contract.methods.approve(GameContractAddress, web3.utils.toWei(amount.toString(), 'ether')).encodeABI(),
      gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      resolve(receipt);
    }).on('error', (error) => {
      console.log(error);
    });

  });
}

function createGameChannel(game) {

  return new Promise(async(resolve, reject) => {

    const contract = new web3.eth.Contract(GameContractABI.abi, GameContractAddress, {
      from: player.address
    });


    const rawTx = {
      to: GameContractAddress,
      data: contract.methods.createGameChannel(web3.utils.fromAscii(game.gameId), game.rounds, web3.utils.toWei(game.bet.toString(), 'ether')).encodeABI(),
      gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      resolve(receipt);
    }).on('error', (error) => {
      console.log(error);
    });

  });
}


function joinGameChannel(game) {

  return new Promise(async(resolve, reject) => {

    const contract = new web3.eth.Contract(GameContractABI.abi, GameContractAddress, {
      from: player.address
    });


    const rawTx = {
      to: GameContractAddress,
      data: contract.methods.joinGameChannel(web3.utils.fromAscii(game.GameId)).encodeABI(),
      gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      resolve(receipt);
    }).on('error', (error) => {
      console.log(error);
    });

  });
}


function updateOnRoundWin(signedMessage, signer, gameId, gameboard, move, activeRound) {

  return new Promise(async(resolve, reject) => {

    const contract = new web3.eth.Contract(GameContractABI.abi, GameContractAddress, {
      from: player.address
    });


    const rawTx = {
      to: GameContractAddress,
      data: contract.methods.updateOnRoundWin(signedMessage, signer, web3.utils.fromAscii(gameId), gameboard, move, activeRound).encodeABI(),
      gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      resolve(receipt);
    }).on('error', (error) => {
      console.log(error);
    });

  });
}

function settlePayments(gameId) {

  return new Promise(async(resolve, reject) => {

    const contract = new web3.eth.Contract(GameContractABI.abi, GameContractAddress, {
      from: player.address
    });


    const rawTx = {
      to: GameContractAddress,
      data: contract.methods.settleGamePayments(web3.utils.fromAscii(gameId)).encodeABI(),
      gas: web3.utils.toHex(300000)
    }

    var tx = await player.signTransaction(rawTx);
    web3.eth.sendSignedTransaction(tx.rawTransaction)
    .on('receipt', (receipt) => {
      resolve(receipt);
    }).on('error', (error) => {
      spinner.fail("Payments not settled");
      console.log(error);
    });

  });
}




var winCombinations = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6],
                       [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

// Determins if the passed in player has three in a row
function checkWin(board, player) {
  var i, j, markCount
  for (i = 0; i < winCombinations.length; i++) {
    markCount = 0;
    for (j = 0; j < winCombinations[i].length; j++) {
      if (board[winCombinations[i][j]] === player) {
        markCount++;
      }
      if (markCount === 3) {
       return true;
      }
    }
  }
  return false;
}

function checkTie(board) {
  for (var i = 0; i < board.length; i++) {
    if (board[i] === '0x0000000000000000000000000000000000000000') {
      return false;
    }
  }
  return true;
}

function printBoard() {
    console.log('\n' +
        ' ' + board[0] + ' | ' + board[1] + ' | ' + board[2] + '\n' +
        ' ---------\n' +
        ' ' + board[3] + ' | ' + board[4] + ' | ' + board[5] + '\n' +
        ' ---------\n' +
        ' ' + board[6] + ' | ' + board[7] + ' | ' + board[8] + '\n');
}
