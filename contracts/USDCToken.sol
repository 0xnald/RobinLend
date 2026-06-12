// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title USDCToken
 * @dev Mock USDC token with a public faucet for testing on Robinhood Chain L2.
 */
contract USDCToken is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        // Mint initial supply to deployer for setup/pool funding
        _mint(msg.sender, 10_000_000 * 10**decimals());
    }

    /**
     * @dev Public faucet. Anyone can call this to get 1,000 mock USDC.
     */
    function faucet(address to, uint256 amount) external {
        // Limit faucet amount per call to avoid spam abuse, e.g. max 10,000 USDC
        require(amount <= 10_000 * 10**decimals(), "USDCToken: faucet limit exceeded");
        _mint(to, amount);
    }
}
