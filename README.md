# Welcome to Tic-Tac-Toe!

A command-line tic-tac-toe game created to show **Ethereum Payment Channel** implementation.


# Getting-Started
1. Install node modules
	`npm i`
2. Start Ganache/ Testrpc
3. Deploy Game Contract and Game Token Contract
	`truffle migrate`
4. Start the game server
	`node server.js`
5. To play game
	`node play.js`

## How to play

 - Players have to create or unlock their ethereum account.
 - Players need to buy Game Tokens to play the game.
 - Player can create new game or join an existing game.
	 - If new game created, enter number of rounds and bet for each round
	 - If joining a game, enter the game id
 - Rounds will start after both players have joined.
 - Payments will be settled at the end of the game.
 - If any player disconnects while game is still in progress, the payments will settled based on the number of rounds any player has won till that time.
