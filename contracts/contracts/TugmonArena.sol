// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TugmonArena {
    // ─── Enums ────────────────────────────────────────────────────────────────
    enum Role { NONE, ENGINEER, SABOTEUR, BOOSTER }

    // ─── Scores ───────────────────────────────────────────────────────────────
    uint256 public redScore;
    uint256 public blueScore;

    // ─── Timed windows ────────────────────────────────────────────────────────
    uint256 public redBoostEndTime;
    uint256 public blueBoostEndTime;
    uint256 public redSabotageEndTime;
    uint256 public blueSabotageEndTime;

    // ─── Per-player state ─────────────────────────────────────────────────────
    // playerTeam: 0 = not joined, 1 = Red, 2 = Blue
    mapping(address => uint8)   public playerTeam;
    mapping(address => Role)    public playerRole;
    mapping(address => uint256) public lastPull;
    mapping(address => uint256) public lastSpecial;

    // ─── Cooldowns ────────────────────────────────────────────────────────────
    uint256 public constant PULL_COOLDOWN    = 0 seconds;
    uint256 public constant SPECIAL_COOLDOWN = 30 seconds;

    // ─── Game meta ────────────────────────────────────────────────────────────
    uint256 public lastReset;
    uint256 public constant GAME_DURATION = 1 minutes;

    // ─── Events ───────────────────────────────────────────────────────────────
    // team: 1 = Red, 2 = Blue
    event PlayerJoined(address indexed player, uint8 team, Role role, string nickname);
    event Pulled(address indexed player, uint8 team, uint256 redScore, uint256 blueScore);
    event Boosted(address indexed player, uint8 team, uint256 endTime);
    event Sabotaged(address indexed player, uint8 targetTeam, uint256 endTime);
    event GameReset(uint256 timestamp);

    constructor() {
        lastReset = block.timestamp;
    }

    // ─── Join ─────────────────────────────────────────────────────────────────
    // team: 1 = Red, 2 = Blue
    function join(uint8 team, string calldata nickname) external {
        require(team == 1 || team == 2, "Bad team: 1=Red 2=Blue");
        require(playerTeam[msg.sender] == 0, "Already joined");

        // Pseudo-random role assignment (fine for hackathon/localhost)
        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, gasleft()))
        ) % 100;

        Role role;
        if      (rand < 15) role = Role.SABOTEUR;  // 15%
        else if (rand < 35) role = Role.BOOSTER;   // 20%
        else                role = Role.ENGINEER;  // 65%

        playerTeam[msg.sender] = team;
        playerRole[msg.sender] = role;

        emit PlayerJoined(msg.sender, team, role, nickname);
    }

    // ─── Pull ─────────────────────────────────────────────────────────────────
    // Uses msg.sender's stored team. Engineers get 2x pull power.
    function pull() external {
        uint8  team = playerTeam[msg.sender];
        Role   role = playerRole[msg.sender];

        require(team != 0, "Call join() first");


        lastPull[msg.sender] = block.timestamp;

        // Engineers pull with 2x base power
        uint256 base = (role == Role.ENGINEER) ? 2 : 1;

        if (team == 1) { // Red
            require(block.timestamp > redSabotageEndTime, "Red team sabotaged!");
            uint256 boostMult = (block.timestamp <= redBoostEndTime) ? 2 : 1;
            redScore += base * boostMult;
        } else { // Blue
            require(block.timestamp > blueSabotageEndTime, "Blue team sabotaged!");
            uint256 boostMult = (block.timestamp <= blueBoostEndTime) ? 2 : 1;
            blueScore += base * boostMult;
        }

        emit Pulled(msg.sender, team, redScore, blueScore);
        _checkReset();
    }

    // ─── Boost (BOOSTER only) ─────────────────────────────────────────────────
    // Gives the booster's team 2x power for 5 seconds.
    function boost() external {
        require(playerRole[msg.sender] == Role.BOOSTER, "Only Boosters can boost");
        require(playerTeam[msg.sender] != 0, "Not joined");
        require(block.timestamp >= lastSpecial[msg.sender] + SPECIAL_COOLDOWN, "Special cooldown");

        lastSpecial[msg.sender] = block.timestamp;
        uint8    team    = playerTeam[msg.sender];
        uint256  endTime;

        if (team == 1) {
            redBoostEndTime  = block.timestamp + 5 seconds;
            endTime = redBoostEndTime;
        } else {
            blueBoostEndTime = block.timestamp + 5 seconds;
            endTime = blueBoostEndTime;
        }

        emit Boosted(msg.sender, team, endTime);
    }

    // ─── Sabotage (SABOTEUR only) ─────────────────────────────────────────────
    // Freezes the OPPOSING team for 3 seconds.
    function sabotage() external {
        require(playerRole[msg.sender] == Role.SABOTEUR, "Only Saboteurs can sabotage");
        require(playerTeam[msg.sender] != 0, "Not joined");
        require(block.timestamp >= lastSpecial[msg.sender] + SPECIAL_COOLDOWN, "Special cooldown");

        lastSpecial[msg.sender] = block.timestamp;
        uint8   myTeam     = playerTeam[msg.sender];
        uint8   targetTeam = (myTeam == 1) ? 2 : 1; // Sabotage the other side
        uint256 endTime;

        if (targetTeam == 1) {
            redSabotageEndTime  = block.timestamp + 3 seconds;
            endTime = redSabotageEndTime;
        } else {
            blueSabotageEndTime = block.timestamp + 3 seconds;
            endTime = blueSabotageEndTime;
        }

        emit Sabotaged(msg.sender, targetTeam, endTime);
    }

    // ─── Views ────────────────────────────────────────────────────────────────
    function getPlayerInfo(address player) external view returns (
        uint8  team,
        Role   role,
        uint256 _lastPull,
        uint256 _lastSpecial
    ) {
        return (playerTeam[player], playerRole[player], lastPull[player], lastSpecial[player]);
    }

    function getGameInfo() external view returns (
        uint256 _redScore,
        uint256 _blueScore,
        uint256 _lastReset,
        uint256 _gameDuration,
        uint256 _redBoostEndTime,
        uint256 _blueBoostEndTime,
        uint256 _redSabotageEndTime,
        uint256 _blueSabotageEndTime
    ) {
        return (
            redScore, blueScore,
            lastReset, GAME_DURATION,
            redBoostEndTime, blueBoostEndTime,
            redSabotageEndTime, blueSabotageEndTime
        );
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function resetGame() external { _reset(); }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _checkReset() internal {
        if (block.timestamp >= lastReset + GAME_DURATION) _reset();
    }

    function _reset() internal {
        redScore  = 0;
        blueScore = 0;
        redBoostEndTime  = 0;
        blueBoostEndTime = 0;
        redSabotageEndTime  = 0;
        blueSabotageEndTime = 0;
        lastReset = block.timestamp;
        emit GameReset(block.timestamp);
    }
}
