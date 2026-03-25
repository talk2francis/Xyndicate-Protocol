// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DecisionLog {
    event DecisionRecorded(address indexed squad, bytes32 decisionHash, uint256 timestamp, string metadata);

    function recordDecision(bytes32 decisionHash, string calldata metadata) external {
        emit DecisionRecorded(msg.sender, decisionHash, block.timestamp, metadata);
    }
}
