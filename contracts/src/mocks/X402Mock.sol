// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract X402Mock {
    event Payment(address indexed payer, address indexed recipient, uint256 amount, bytes memo);

    function pay(address recipient, uint256 amount, bytes calldata memo) external {
        emit Payment(msg.sender, recipient, amount, memo);
    }
}
