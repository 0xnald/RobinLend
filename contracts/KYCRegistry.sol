// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KYCRegistry
 * @dev Manages KYC / Accreditation status of addresses for compliant RWA operations.
 */
contract KYCRegistry {
    address public owner;
    
    mapping(address => bool) private _verifiedUsers;

    event UserVerified(address indexed user);
    event UserRevoked(address indexed user);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "KYCRegistry: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @dev Checks if a user is KYC verified.
     */
    function isVerified(address user) public view returns (bool) {
        return _verifiedUsers[user];
    }

    /**
     * @dev Allows self-service KYC verification for testnet purposes.
     */
    function register() external {
        _verifiedUsers[msg.sender] = true;
        emit UserVerified(msg.sender);
    }

    /**
     * @dev Sets the KYC status of a single user.
     */
    function setKYCStatus(address user, bool status) external onlyOwner {
        _verifiedUsers[user] = status;
        if (status) {
            emit UserVerified(user);
        } else {
            emit UserRevoked(user);
        }
    }

    /**
     * @dev Sets the KYC status of multiple users in a single batch.
     */
    function setKYCStatusBatch(address[] calldata users, bool[] calldata statuses) external onlyOwner {
        require(users.length == statuses.length, "KYCRegistry: array lengths mismatch");
        for (uint256 i = 0; i < users.length; i++) {
            _verifiedUsers[users[i]] = statuses[i];
            if (statuses[i]) {
                emit UserVerified(users[i]);
            } else {
                emit UserRevoked(users[i]);
            }
        }
    }

    /**
     * @dev Transfers ownership of the registry.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "KYCRegistry: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
