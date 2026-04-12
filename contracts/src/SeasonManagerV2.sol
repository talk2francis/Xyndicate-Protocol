// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SeasonManagerV2 {
    struct Squad {
        address owner;
        address agentWallet;
        bool active;
        uint256 entryFeePaid;
        uint256 enrolledAt;
    }

    uint256 public entryFee;
    address public owner;
    string public seasonId;
    mapping(address => Squad) public squads;

    event EntryFeePaid(address indexed payer, uint256 amount, string seasonId);
    event SquadEnrolled(address indexed squadOwner, address agentWallet, uint256 amount, string seasonId);
    event SquadDeactivated(address indexed squadOwner);
    event SquadClosed(address indexed squadOwner);
    event EntryFeeUpdated(uint256 newFee);
    event Withdrawn(address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(uint256 _entryFee, string memory _seasonId) {
        owner = msg.sender;
        entryFee = _entryFee;
        seasonId = _seasonId;
    }

    function enroll(address agentWallet) external payable {
        require(agentWallet != address(0), "invalid wallet");
        require(squads[msg.sender].active == false || squads[msg.sender].owner == address(0), "already enrolled");
        require(msg.value >= entryFee, "fee too low");

        squads[msg.sender] = Squad({
            owner: msg.sender,
            agentWallet: agentWallet,
            active: true,
            entryFeePaid: msg.value,
            enrolledAt: block.timestamp
        });

        emit EntryFeePaid(msg.sender, msg.value, seasonId);
        emit SquadEnrolled(msg.sender, agentWallet, msg.value, seasonId);
    }

    function deactivate() external {
        Squad storage squad = squads[msg.sender];
        require(squad.owner == msg.sender, "not squad");
        require(squad.active, "inactive");
        squad.active = false;
        emit SquadDeactivated(msg.sender);
    }

    function closeSquad() external {
        Squad storage squad = squads[msg.sender];
        require(squad.owner == msg.sender, "not squad");
        delete squads[msg.sender];
        emit SquadClosed(msg.sender);
    }

    function updateEntryFee(uint256 newFee) external onlyOwner {
        entryFee = newFee;
        emit EntryFeeUpdated(newFee);
    }

    function withdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "invalid recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "no balance");
        recipient.transfer(balance);
        emit Withdrawn(recipient, balance);
    }
}
