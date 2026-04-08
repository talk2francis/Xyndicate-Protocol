// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StrategyVault {
    mapping(bytes32 => uint256) public depositedAmount;
    mapping(bytes32 => int256) public pnlDelta;
    mapping(bytes32 => uint256) public lastUpdated;

    event VaultUpdated(bytes32 indexed squadId, int256 pnl, uint256 timestamp);

    function deposit(bytes32 squadId) external payable {
        depositedAmount[squadId] += msg.value;
        lastUpdated[squadId] = block.timestamp;
    }

    function recordPnL(bytes32 squadId, int256 delta) external {
        pnlDelta[squadId] += delta;
        lastUpdated[squadId] = block.timestamp;
        emit VaultUpdated(squadId, pnlDelta[squadId], block.timestamp);
    }

    function getVaultStats(bytes32 squadId) external view returns (uint256 deposited, int256 pnl, uint256 ts) {
        return (depositedAmount[squadId], pnlDelta[squadId], lastUpdated[squadId]);
    }
}
