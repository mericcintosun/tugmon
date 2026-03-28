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
    // communityId: 0 = none, 1 = nads, 2 = molandaks, 3 = nomads, 4 = chads_soyjaks (matches frontend)
    mapping(address => uint8)   public playerCommunity;
    mapping(address => uint256) public lastPull;
    mapping(address => uint256) public lastSpecial;

    // ─── Cooldowns ────────────────────────────────────────────────────────────
    uint256 public constant PULL_COOLDOWN    = 0 seconds;
    uint256 public constant SPECIAL_COOLDOWN = 30 seconds;
    uint256 public constant MAX_PULL_BATCH   = 32;

    // ─── Game meta ────────────────────────────────────────────────────────────
    uint256 public lastReset;
    uint256 public constant GAME_DURATION = 1 minutes;

    // ─── Events ───────────────────────────────────────────────────────────────
    event PlayerJoined(address indexed player, uint8 team, uint8 communityId, uint8 role, string nickname);
    event Pulled(address indexed player, uint8 team, uint256 redScore, uint256 blueScore);
    event Boosted(address indexed player, uint8 team, uint256 endTime);
    event Sabotaged(address indexed player, uint8 targetTeam, uint256 endTime);
    event GameReset(uint256 timestamp);

    constructor() {
        lastReset = block.timestamp;
    }

    // ─── Join ─────────────────────────────────────────────────────────────────
    // team: 1 = Red, 2 = Blue — chosen explicitly by the player
    // communityId: 1..4 = Gmonad allegiance (stats / identity), independent of team
    function join(uint8 team, uint8 communityId, string calldata nickname) external {
        require(team == 1 || team == 2, "Bad team: 1=Red 2=Blue");
        require(communityId >= 1 && communityId <= 4, "Bad community: 1-4");
        require(playerTeam[msg.sender] == 0, "Already joined");

        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, gasleft()))
        ) % 100;

        Role role;
        if      (rand < 15) role = Role.SABOTEUR;
        else if (rand < 35) role = Role.BOOSTER;
        else                role = Role.ENGINEER;

        playerTeam[msg.sender] = team;
        playerRole[msg.sender] = role;
        playerCommunity[msg.sender] = communityId;

        emit PlayerJoined(msg.sender, team, communityId, uint8(role), nickname);
    }

    // ─── Pull (single) ───────────────────────────────────────────────────────
    function pull() external {
        _pullOnce();
        _checkReset();
    }

    /// @notice Same scoring as repeated `pull()` but one tx — use for NFT/raid multipliers.
    function pullMany(uint8 n) external {
        require(n > 0 && n <= MAX_PULL_BATCH, "Bad batch size");
        for (uint256 i = 0; i < uint256(n); i++) {
            _pullOnce();
            _checkReset();
        }
    }

    function _pullOnce() internal {
        uint8  team = playerTeam[msg.sender];
        Role   role = playerRole[msg.sender];

        require(team != 0, "Call join() first");

        lastPull[msg.sender] = block.timestamp;

        uint256 base = (role == Role.ENGINEER) ? 2 : 1;

        if (team == 1) {
            require(block.timestamp > redSabotageEndTime, "Red team sabotaged!");
            uint256 boostMult = (block.timestamp <= redBoostEndTime) ? 2 : 1;
            redScore += base * boostMult;
        } else {
            require(block.timestamp > blueSabotageEndTime, "Blue team sabotaged!");
            uint256 boostMult = (block.timestamp <= blueBoostEndTime) ? 2 : 1;
            blueScore += base * boostMult;
        }

        emit Pulled(msg.sender, team, redScore, blueScore);
    }

    // ─── Boost (BOOSTER only) ─────────────────────────────────────────────────
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
    function sabotage() external {
        require(playerRole[msg.sender] == Role.SABOTEUR, "Only Saboteurs can sabotage");
        require(playerTeam[msg.sender] != 0, "Not joined");
        require(block.timestamp >= lastSpecial[msg.sender] + SPECIAL_COOLDOWN, "Special cooldown");

        lastSpecial[msg.sender] = block.timestamp;
        uint8   myTeam     = playerTeam[msg.sender];
        uint8   targetTeam = (myTeam == 1) ? 2 : 1;
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
        uint8  role,
        uint8  community,
        uint256 _lastPull,
        uint256 _lastSpecial
    ) {
        return (
            playerTeam[player],
            uint8(playerRole[player]),
            playerCommunity[player],
            lastPull[player],
            lastSpecial[player]
        );
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

    function resetGame() external { _reset(); }

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
