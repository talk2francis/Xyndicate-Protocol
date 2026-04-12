// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DecisionLog {
    struct Decision {
        bytes32 decisionHash;
        string metadata;
        uint256 timestamp;
    }

    Decision[] public decisions;

    event DecisionRecorded(bytes32 indexed decisionHash, string metadata, uint256 timestamp);

    function _storeDecision(bytes32 decisionHash, string memory metadata) internal {
        decisions.push(Decision({ decisionHash: decisionHash, metadata: metadata, timestamp: block.timestamp }));
        emit DecisionRecorded(decisionHash, metadata, block.timestamp);
    }

    function recordDecision(bytes32 decisionHash, string calldata metadata) external {
        _storeDecision(decisionHash, metadata);
    }

    function logDecision(
        string calldata squadId,
        string calldata agentChain,
        string calldata rationale
    ) external {
        bytes32 decisionHash = keccak256(abi.encodePacked(squadId, agentChain, rationale, block.timestamp));
        _storeDecision(decisionHash, string(abi.encodePacked(squadId, " | ", agentChain, " | ", rationale)));
    }

    function getDecisionCount() external view returns (uint256) {
        return decisions.length;
    }

    function getDecision(uint256 index)
        external
        view
        returns (bytes32, string memory, uint256)
    {
        Decision memory d = decisions[index];
        return (d.decisionHash, d.metadata, d.timestamp);
    }

    function getRecord(uint256 index)
        external
        view
        returns (bytes32 decisionHash, string memory metadata, uint256 timestamp)
    {
        Decision memory d = decisions[index];
        return (d.decisionHash, d.metadata, d.timestamp);
    }
}
