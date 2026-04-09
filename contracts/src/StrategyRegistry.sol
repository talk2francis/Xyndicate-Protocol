// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StrategyRegistry {
    struct Listing {
        bytes32 squadId;
        address owner;
        string name;
        string assetPair;
        string mode;
        string risk;
        bool available;
        uint256 updatedAt;
    }

    mapping(bytes32 => Listing) private listings;
    mapping(address => bytes32[]) private ownerListings;
    mapping(bytes32 => bool) private seen;
    bytes32[] private allListings;

    event StrategyListed(bytes32 indexed squadId, address indexed owner, string name, bool available);

    function listStrategy(
        bytes32 squadId,
        string calldata name,
        string calldata assetPair,
        string calldata mode,
        string calldata risk,
        bool available
    ) external {
        require(squadId != bytes32(0), "invalid squad");
        require(bytes(name).length > 0, "invalid name");

        if (!seen[squadId]) {
            seen[squadId] = true;
            allListings.push(squadId);
            ownerListings[msg.sender].push(squadId);
        } else {
            require(listings[squadId].owner == msg.sender, "not owner");
        }

        listings[squadId] = Listing({
            squadId: squadId,
            owner: msg.sender,
            name: name,
            assetPair: assetPair,
            mode: mode,
            risk: risk,
            available: available,
            updatedAt: block.timestamp
        });

        emit StrategyListed(squadId, msg.sender, name, available);
    }

    function getListing(bytes32 squadId) external view returns (Listing memory) {
        return listings[squadId];
    }

    function getOwnerListings(address owner) external view returns (bytes32[] memory) {
        return ownerListings[owner];
    }

    function getAllListings() external view returns (bytes32[] memory) {
        return allListings;
    }
}
