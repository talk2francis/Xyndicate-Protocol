// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DecisionLog {
    struct Record {
        address squad;
        bytes32 decisionHash;
        uint256 timestamp;
        string metadata;
    }

    Record[] public records;

    event DecisionRecorded(uint256 indexed recordId, address indexed squad, bytes32 decisionHash, string metadata);

    function recordDecision(bytes32 decisionHash, string calldata metadata) external returns (uint256 recordId) {
        recordId = records.length;
        records.push(Record({
            squad: msg.sender,
            decisionHash: decisionHash,
            timestamp: block.timestamp,
            metadata: metadata
        }));
        emit DecisionRecorded(recordId, msg.sender, decisionHash, metadata);
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        return records[recordId];
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }
}
