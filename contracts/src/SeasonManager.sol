// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IX402 {
    function pay(address recipient, uint256 amount, bytes calldata memo) external;
}

contract SeasonManager {
    struct Squad {
        address owner;
        address agentWallet;
        bool active;
    }

    IX402 public paymentHub;
    uint256 public entryFee;
    mapping(address => Squad) public squads;

    event SquadEnrolled(address indexed squad, address agentWallet);
    event SquadDeactivated(address indexed squad);
    event X402PaymentReceived(address indexed agent, uint256 amount, string seasonId);

    constructor(address _paymentHub, uint256 _entryFee) {
        paymentHub = IX402(_paymentHub);
        entryFee = _entryFee;
    }

    function enroll(address agentWallet) external {
        require(agentWallet != address(0), "invalid wallet");
        require(squads[msg.sender].owner == address(0), "already enrolled");

        paymentHub.pay(address(this), entryFee, "ENTRY_FEE");

        squads[msg.sender] = Squad({ owner: msg.sender, agentWallet: agentWallet, active: true });
        emit SquadEnrolled(msg.sender, agentWallet);
    }

    function payEntryFee(string calldata seasonId) external payable {
        require(msg.value >= entryFee, "fee too low");
        emit X402PaymentReceived(msg.sender, msg.value, seasonId);
    }

    function deactivate() external {
        Squad storage squad = squads[msg.sender];
        require(squad.owner == msg.sender, "not squad");
        require(squad.active, "inactive");
        squad.active = false;
        emit SquadDeactivated(msg.sender);
    }

    function updateEntryFee(uint256 newFee) external {
        require(msg.sender == address(paymentHub), "not authorized");
        entryFee = newFee;
    }
}
