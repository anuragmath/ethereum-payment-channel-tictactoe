const ethereumjs = require('ethereumjs-abi')
const ethereumjsUtil = require('ethereumjs-util')
const Web3 = require('web3');
const http = require('http').createServer();
const io = require('socket.io')(http);
const port = 3000

var web3 = new Web3('http://localhost:8545');

let newGames = new Map();
let activeGames = new Map();
let inactiveGames = new Map();

io.on('connection', (socket) => {
    // console.log('connected');

    socket.on('Created-NewGame', (data) => {

      const game = {
        id: data.gameId,
        player1Address: data.player,
        player1Id: data.playerId,
        player2Address: null,
        player2Id: null,
        rounds: data.rounds,
        bet: data.bet,
        activeRound: 0,
        turnSequence: 0,
        board: new Array(9).fill('0x0000000000000000000000000000000000000000'),
        player1Wins: 0,
        player2Wins: 0,
        lastMoveSignature: null,
        signer: null
      }

      newGames.set(game.id, game);


      //io.to(data.playerId).emit('message', game);
    });

    socket.on('Joined-NewGame', (data) => {

      if(newGames.has(data.gameId)){
        let game = newGames.get(data.gameId);

        io.to(game.player1Id).emit('Player-2-Joined');

        game.player2Address = data.playerAddress;
        game.player2Id = data.playerId;

        newGames.delete(game.id);
        game.activeRound = 1;
        activeGames.set(game.id, game);

        io.to(game.player1Id).emit('message', "Round " + game.activeRound + " Begins");
        io.to(game.player2Id).emit('message', "Round " + game.activeRound + " Begins");

        io.to(game.player1Id).emit('Your-Turn', {
          id: game.id,
          activeRound: game.activeRound,
          board: game.board,
          lastMoveSignature: null,
          signer: null
        });
        io.to(game.player2Id).emit('Waiting', 'Wait for Player 1 move');
      } else {
        console.log("something went wrong");
      }

    });

    socket.on('Get-NewGames-List', (id) => {

      let games = [];
      newGames.forEach((value, key, map) => {
        games.push({
          GameId: value.id,
          Player1: value.player1Address,
          Rounds: value.rounds,
          Bet: value.bet
        });
      });

      io.to(id).emit('NewGames-List', games);
    });


    socket.on('message', (evt) => {
        console.log(evt)
        socket.broadcast.emit('message', evt)
    });

    socket.on('Player-1-Played', (data) => {

      if(activeGames.has(data.gameId)){

        let game = activeGames.get(data.gameId);

        game.board[data.move] = game.player1Address;

        const is_valid = verifyMessage(data.signedMessage.signature,
            game.player1Address, game.id, game.board, game.activeRound);

        if(is_valid){

            game.board[data.move] = game.player1Address;
            game.turnSequence++;
            game.lastMoveSignature = data.signedMessage;
            game.signer = data.signer;
            activeGames.set(game.id, game);

            io.to(game.player2Id).emit('Your-Turn', {
              id: game.id,
              activeRound: game.activeRound,
              board: game.board,
              lastMoveSignature: game.lastMoveSignature,
              signer: game.signer
            });

            io.to(game.player1Id).emit('Waiting', 'Wait for Player 2 move');
        } else {

            io.to(game.player1Id).emit('Invalid-Message',  {
              id: game.id,
              activeRound: game.activeRound,
              board: game.board,
              lastMoveSignature: game.lastMoveSignature,
              signer: game.signer
            });
        }

      } else {
        console.log("something went wrong");
      }
    });

    socket.on('Player-2-Played', (data) => {

      if(activeGames.has(data.gameId)){

        let game = activeGames.get(data.gameId);

        game.board[data.move] = game.player2Address;

        const is_valid = verifyMessage(data.signedMessage.signature,
            game.player2Address, game.id, game.board, game.activeRound);

        if(is_valid){

            game.board[data.move] = game.player2Address;
            game.turnSequence++;
            game.lastMoveSignature = data.signedMessage;
            game.signer = data.signer;

            activeGames.set(game.id, game);

            io.to(game.player1Id).emit('Your-Turn', {
              id: game.id,
              activeRound: game.activeRound,
              board: game.board,
              lastMoveSignature: game.lastMoveSignature,
              signer: game.signer
            });

            io.to(game.player2Id).emit('Waiting', 'Wait for Player 1 move');
        } else {

            io.to(game.player2Id).emit('Invalid-Message',  {
              id: game.id,
              activeRound: game.activeRound,
              board: game.board,
              lastMoveSignature: game.lastMoveSignature,
              signer: game.signer
            });
        }

      } else {
        console.log("something went wrong");
      }
    });

    socket.on('Round-Won', (data) => {

      console.log("Round won", data);

      if(activeGames.has(data.gameId)){

        let game = activeGames.get(data.gameId);

        game.board[data.move] = data.signer;

        const is_valid = verifyMessage(data.signedMessage.signature,
            data.signer, game.id, game.board, game.activeRound);

        if(is_valid){

            game.board[data.move] = data.signer;

            if(checkWin(game.board, data.signer)){

              if(data.signer === game.player1Address){
                game.player1Wins++;
                io.to(game.player2Id).emit('Round-Lost');
              }
              else {
                game.player2Wins++;
                io.to(game.player1Id).emit('Round-Lost');
              }

              game.activeRound++;

              //Check number of rounds doesnt exceed actual rounds

              if(game.activeRound > game.rounds){
                endGame(game);
              } else{
                game.turnSequence = 0;
                game.board = new Array(9).fill('0x0000000000000000000000000000000000000000');
                activeGames.set(game.id, game);

                io.to(game.player1Id).emit('message', "Round " + game.activeRound + " Begins");
                io.to(game.player2Id).emit('message', "Round " + game.activeRound + " Begins");

                if(data.signer === game.player1Address){
                  io.to(game.player1Id).emit('Your-Turn', {
                    id: game.id,
                    activeRound: game.activeRound,
                    board: game.board,
                    lastMoveSignature: null,
                    signer: null
                  });
                  io.to(game.player2Id).emit('Waiting', 'Wait for Player 1 move');
                }
                else {
                  io.to(game.player2Id).emit('Your-Turn', {
                    id: game.id,
                    activeRound: game.activeRound,
                    board: game.board,
                    lastMoveSignature: null,
                    signer: null
                  });
                  io.to(game.player1Id).emit('Waiting', 'Wait for Player 2 move');
                }
              }
            }
        } else {

            io.to(game.player2Id).emit('Invalid-Message',  {
              id: game.id,
              activeRound: game.activeRound,
              board: game.board,
              lastMoveSignature: game.lastMoveSignature,
              signer: game.signer
            });
        }

      } else {
        console.log("something went wrong");
      }
    });

    socket.on('Round-Tie', (data) => {
      //verify signed message and hash
      console.log("Round Tie", data);
      if(activeGames.has(data.gameId)){

        let game = activeGames.get(data.gameId);
        game.board[data.move] = data.signer;
        if(checkTie(game.board)){

          game.activeRound++;

          io.to(game.player1Id).emit('Round-Tie');
          io.to(game.player2Id).emit('Round-Tie');

          if(game.activeRound > game.rounds){
            return endGame(game);
          }

          game.turnSequence = 0;
          game.board = new Array(9).fill('0x0000000000000000000000000000000000000000');
          activeGames.set(game.id, game);

          io.to(game.player1Id).emit('message', "Round " + game.activeRound + " Begins");
          io.to(game.player2Id).emit('message', "Round " + game.activeRound + " Begins");

          if(data.signer === game.player2Address){
            io.to(game.player1Id).emit('Your-Turn', game);
            io.to(game.player2Id).emit('Waiting', 'Wait for Player 1 move');
          }
          else {
            io.to(game.player2Id).emit('Your-Turn', game);
            io.to(game.player1Id).emit('Waiting', 'Wait for Player 2 move');
          }
        }
      } else {
        console.log("something went wrong");
      }
    });

    socket.on('disconnect', () => {
      console.log('disconnected', socket.id);

      activeGames.forEach((value, key, map) => {
        if(value.player1Id === socket.id){
          io.to(value.player2Id).emit('Opponent-Disconnected');
          return
        } else if (value.player2Id === socket.id)
          io.to(value.player1Id).emit('Opponent-Disconnected');
          return
      });
    });

});

io.on('disconnect', () => {
    console.log('diconnected');
});


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
  for (var i = 0; i <= board.length; i++) {
    if (board[i] === '0x0000000000000000000000000000000000000000') {
      return false;
    }
  }
  return true;
}

function generateHash(gameId, board, activeRound) {

  const hash = web3.utils.soliditySha3({
    type: 'bytes32',
    value: web3.utils.fromAscii(gameId)
  }, {
    type: 'address[9]',
    value: board
  },
  {
    type: 'uint256',
    value: activeRound
  });

  return hash;
}

function verifyMessage(signedMessage, playerAddress, gameId, board, activeRound) {

  const hash = generateHash(gameId, board, activeRound);

  const message = ethereumjs.soliditySHA3(
		['string', 'bytes32'],
		['\x19Ethereum Signed Message:\n32', hash]
	);

	const splitSignature = ethereumjsUtil.fromRpcSig(signedMessage);
  const publicKey = ethereumjsUtil.ecrecover(message, splitSignature.v, splitSignature.r, splitSignature.s)
  const signer = ethereumjsUtil.pubToAddress(publicKey).toString('hex')
  const isMessageValid = (signer.toLowerCase() == ethereumjsUtil.stripHexPrefix(playerAddress).toLowerCase());
  return isMessageValid;
}

function endGame(game) {

  activeGames.delete(game.id);
  inactiveGames.set(game.id, game);

  io.to(game.player1Id).emit('End-Game', {
    wins: game.player1Wins,
    bet: game.bet,
    rounds: game.rounds,
    gameId: game.id
  });

  io.to(game.player2Id).emit('End-Game', {
    wins: game.player2Wins,
    bet: game.bet,
    rounds: game.rounds,
    gameId: game.id
  });

}




http.listen(port, () => console.log(`server listening on port: ${port}`))
