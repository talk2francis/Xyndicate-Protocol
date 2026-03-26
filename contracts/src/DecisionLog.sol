// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DecisionLog {
    struct Decision {
        string squadId;
        string agentChain;
        string rationale;
        uint256 timestamp;
    }

    Decision[] public decisions;

    event DecisionRecorded(
        string indexed squadId,
        string agentChain,
        string rationale,
        uint256 timestamp
    );

    function logDecision(
        string calldata squadId,
        string calldata agentChain,
        string calldata rationale
    ) external {
        decisions.push(
            Decision({
                squadId: squadId,
                agentChain: agentChain,
                rationale: rationale,
                timestamp: block.timestamp
            })
        );
        emit DecisionRecorded(squadId, agentChain, rationale, block.timestamp);
    }

    function getDecisionCount() external view returns (uint256) {
        return decisions.length;
    }

    function getDecision(uint256 index)
        external
        view
        returns (string memory, string memory, string memory, uint256)
    {
        Decision memory d = decisions[index];
        return (d.squadId, d.agentChain, d.rationale, d.timestamp);
    }
}
