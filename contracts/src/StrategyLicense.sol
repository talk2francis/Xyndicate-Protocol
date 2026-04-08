// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StrategyLicense {
    address public owner;
    uint256 public priceWei;

    mapping(address => mapping(bytes32 => bool)) private licenses;

    event LicensePurchased(address indexed buyer, bytes32 indexed squadId, uint256 priceWei);
    event LicenseGranted(address indexed buyer, bytes32 indexed squadId);
    event LicenseRevoked(address indexed buyer, bytes32 indexed squadId);
    event PriceUpdated(uint256 newPriceWei);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(uint256 _priceWei) {
        owner = msg.sender;
        priceWei = _priceWei;
    }

    function buyLicense(bytes32 squadId) external payable {
        require(squadId != bytes32(0), "invalid squad");
        require(msg.value >= priceWei, "insufficient payment");

        licenses[msg.sender][squadId] = true;
        emit LicensePurchased(msg.sender, squadId, msg.value);
    }

    function grantLicense(address user, bytes32 squadId) external onlyOwner {
        require(user != address(0), "invalid user");
        require(squadId != bytes32(0), "invalid squad");

        licenses[user][squadId] = true;
        emit LicenseGranted(user, squadId);
    }

    function revokeLicense(address user, bytes32 squadId) external onlyOwner {
        require(user != address(0), "invalid user");
        require(squadId != bytes32(0), "invalid squad");

        licenses[user][squadId] = false;
        emit LicenseRevoked(user, squadId);
    }

    function isLicensed(address caller, bytes32 squadId) external view returns (bool) {
        return licenses[caller][squadId];
    }

    function setPrice(uint256 newPriceWei) external onlyOwner {
        priceWei = newPriceWei;
        emit PriceUpdated(newPriceWei);
    }

    function withdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "invalid recipient");
        recipient.transfer(address(this).balance);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
