// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./KYCRegistry.sol";

/**
 * @title RWAToken
 * @dev A compliance-gated ERC-20 token representing a tokenized Real-World Asset (e.g. iUST, iAAPL).
 * Transactees must be registered in the KYCRegistry.
 */
contract RWAToken is ERC20 {
    address public owner;
    KYCRegistry public kycRegistry;

    modifier onlyOwner() {
        require(msg.sender == owner, "RWAToken: caller is not the owner");
        _;
    }

    modifier onlyKYC(address account) {
        if (account != address(0)) {
            require(kycRegistry.isVerified(account), "RWAToken: account is not KYC verified");
        }
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _kycRegistryAddress
    ) ERC20(name, symbol) {
        owner = msg.sender;
        kycRegistry = KYCRegistry(_kycRegistryAddress);
    }

    /**
     * @dev Mint new tokens. Only the owner can mint, and only to a KYC verified address.
     */
    function mint(address to, uint256 amount) external onlyOwner onlyKYC(to) {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens.
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @dev Sets a new KYC registry address.
     */
    function updateKYCRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "RWAToken: invalid registry address");
        kycRegistry = KYCRegistry(_newRegistry);
    }

    /**
     * @dev Transfers ownership of the token contract.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "RWAToken: new owner is the zero address");
        owner = newOwner;
    }

    /**
     * @dev Override ERC20 transfer execution to enforce compliance rules.
     * Note: OpenZeppelin v5 uses `_update` for transfers, mints, and burns.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override onlyKYC(from) onlyKYC(to) {
        super._update(from, to, value);
    }
}
