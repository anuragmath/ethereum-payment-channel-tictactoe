pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract GameContract {

  using SafeMath for uint256;

  address public GameTokenAddres;
  uint256 public GameTokenRate;

  struct Game {
    address player1;
    address player2;
    uint256 bet;
    uint256 rounds;
    uint256 totalBet;
    uint256 player1Wins;
    uint256 player2Wins;
    bool player1Claim;
    bool player2Claim;
    bool isOpen;
  }

  mapping(bytes32 => Game) public games;

  event GameChannelCreated(bytes32 indexed gameId, address indexed player);
  event GameChannelJoined(bytes32 indexed gameId, address indexed player);
  event GameRoundWon(bytes32 indexed gameId, address indexed player);
  event GamePayoutSettled(bytes32 indexed gameId, address indexed player);


  constructor(address _gameTokenAddress, uint256 _rate) public {
    GameTokenAddres = _gameTokenAddress;
    GameTokenRate = _rate;
  }

  function() payable external {
    buyGameTokens();
  }

  modifier onlyPlayers(bytes32 _gameId) {
    require(msg.sender == games[_gameId].player1 || msg.sender == games[_gameId].player2, "You are not playing this game");
    _;
  }


  function buyGameTokens() payable public {

    uint256 tokenAmount = (msg.value).mul(GameTokenRate);

    require(
            ERC20Mintable(GameTokenAddres).mint(msg.sender, tokenAmount),
                "MintedCrowdsale: minting failed"
    );

  }

  function createGameChannel(bytes32 _gameId, uint256 _rounds, uint256 _bet) public {

        require(checkDuplicateGame(_gameId), "Duplicate Game Id already exists");

        uint256 amount = _rounds.mul(_bet);

        if(amount > ERC20Mintable(GameTokenAddres).allowance(msg.sender, address(this))) {
            revert();
        }

        ERC20Mintable(GameTokenAddres).transferFrom(msg.sender, address(this), amount);

        games[_gameId] = Game(msg.sender, address(0), _bet, _rounds, amount, 0, 0, false, false, false);

        emit GameChannelCreated(_gameId, msg.sender);

  }


  function joinGameChannel(bytes32 _gameId) public {

      require(checkGameAvailablity(_gameId), "Game not available to join");

      Game storage game = games[_gameId];

      uint256 amount = game.rounds.mul(game.bet);

      if(amount > ERC20Mintable(GameTokenAddres).allowance(msg.sender, address(this))) {
          revert();
      }

      ERC20Mintable(GameTokenAddres).transferFrom(msg.sender, address(this), amount);


      game.player2 = msg.sender;
      game.isOpen = true;
      game.totalBet = game.totalBet.add(amount);

      emit GameChannelJoined(_gameId, msg.sender);


  }

    function updateOnRoundWin(bytes memory playerMessage, address signer, bytes32 _gameId, address[9] memory board, uint256 move, uint256 activeRound) public onlyPlayers(_gameId) {

        require(games[_gameId].player2 != address(0), '#1 The address of the player is invalid');
        require(playerMessage.length == 65, '#2 The length of the message is invalid');
        require(signer == games[_gameId].player1 || signer == games[_gameId].player2, '#3 You must use a valid address of one of the players');
        require(board[move] == address(0) && move < 9, '#4 This move is invalid');
        require(!checkRewardClaim(_gameId), "#5 Players have already settle payments");
        // Recreate the signed message for the first player to verify that the parameters are correct
        bytes32 message = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(_gameId, board, activeRound))));
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(playerMessage, 32))
            s := mload(add(playerMessage, 64))
            v := byte(0, mload(add(playerMessage, 96)))
        }

        address originalSigner = ecrecover(message, v, r, s);
        require(originalSigner == signer, '#6 The signer must be the original address');

        board[move] = msg.sender;

        require(checkWinningClaim(board, msg.sender), '#7 The Winning Claim is Invalid');

        if(msg.sender == games[_gameId].player1)
          games[_gameId].player1Wins++;
        else
          games[_gameId].player2Wins++;

        emit GameRoundWon(_gameId, msg.sender);

  }

  function checkWinningClaim(address[9] memory board, address player) private returns(bool){

      if(board[0] == player && board[1] == player && board[2] == player){
        return true;
      } else if (board[3] == player && board[4] == player && board[5] == player) {
        return true;
      } else if (board[6] == player && board[7] == player && board[8] == player) {
        return true;
      } else if (board[0] == player && board[3] == player && board[6] == player) {
        return true;
      } else if (board[1] == player && board[4] == player && board[7] == player) {
        return true;
      } else if (board[2] == player && board[5] == player && board[8] == player) {
        return true;
      } else if (board[0] == player && board[4] == player && board[8] == player) {
        return true;
      } else if (board[2] == player && board[4] == player && board[6] == player) {
        return true;
      } else {
        return false;
      }
  }

  function settleGamePayments(bytes32 _gameId) public onlyPlayers(_gameId) returns(uint256 reward){

    uint256 ties = games[_gameId].rounds.sub(games[_gameId].player1Wins.add(games[_gameId].player2Wins));

    if(msg.sender == games[_gameId].player1 && !games[_gameId].player1Claim){

        reward = (games[_gameId].player1Wins.mul(uint256(2).mul(games[_gameId].bet))).add(ties.mul(games[_gameId].bet));
        games[_gameId].player1Claim = true;
        ERC20Mintable(GameTokenAddres).transfer(games[_gameId].player1, reward);
    }
    else if(msg.sender == games[_gameId].player2 && !games[_gameId].player2Claim){

      reward = (games[_gameId].player2Wins.mul(uint256(2).mul(games[_gameId].bet))).add(ties.mul(games[_gameId].bet));
      games[_gameId].player1Claim = true;
      ERC20Mintable(GameTokenAddres).transfer(games[_gameId].player2, reward);
    }

    games[_gameId].totalBet = games[_gameId].totalBet.sub(reward);

    if(games[_gameId].totalBet == 0)
      games[_gameId].isOpen = false;

    emit GamePayoutSettled(_gameId, msg.sender);
    return reward;
  }

  function checkDuplicateGame(bytes32 _gameId) public view returns(bool){
      Game storage game = games[_gameId];
      return (game.player1 == address(0));
  }

  function checkGameOpen(bytes32 _gameId) public view returns(bool) {
      return games[_gameId].isOpen;
  }

  function checkRewardClaim(bytes32 _gameId) public view returns(bool) {
      Game storage game = games[_gameId];
      return (game.player1Claim || game.player2Claim);
  }

  function checkGameAvailablity(bytes32 _gameId) public returns(bool) {
    Game storage game = games[_gameId];
    return (game.player2 == address(0));
  }

}
