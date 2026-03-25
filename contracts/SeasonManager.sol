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

    IX402 public immutable paymentHub;
    uint256 public entryFee;
    mapping(address => Squad) public squads;

    event SquadEnrolled(address indexed squad, address agentWallet);

    constructor(address _paymentHub, uint256 _entryFee) {
        paymentHub = IX402(_paymentHub);
        entryFee = _entryFee;
    }

    function enroll(address agentWallet) external {
        require(squads[msg.sender].owner == address(0), "Already enrolled");
        paymentHub.pay(address(this), entryFee, "ENTRY_FEE");
        squads[msg.sender] = Squad({ owner: msg.sender, agentWallet: agentWallet, active: true });
        emit SquadEnrolled(msg.sender, agentWallet);
    }
}
