// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PriceOracle
 * @dev Mock price oracle that lets the admin set asset prices (e.g. RWAs and stablecoins).
 * Prices are in USD with 8 decimals (standard Chainlink format).
 */
contract PriceOracle {
    address public owner;
    
    // mapping of asset address -> price (8 decimals)
    mapping(address => uint256) private _prices;

    event PriceUpdated(address indexed asset, uint256 price);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "PriceOracle: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @dev Retrieves the price of an asset (8 decimals).
     */
    function getAssetPrice(address asset) external view returns (uint256) {
        uint256 price = _prices[asset];
        require(price > 0, "PriceOracle: price not set for asset");
        return price;
    }

    /**
     * @dev Sets the price of an asset (8 decimals).
     */
    function setAssetPrice(address asset, uint256 price) external onlyOwner {
        require(price > 0, "PriceOracle: price must be greater than zero");
        _prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    /**
     * @dev Sets prices for multiple assets in batch.
     */
    function setAssetPriceBatch(address[] calldata assets, uint256[] calldata prices) external onlyOwner {
        require(assets.length == prices.length, "PriceOracle: array lengths mismatch");
        for (uint256 i = 0; i < assets.length; i++) {
            require(prices[i] > 0, "PriceOracle: price must be greater than zero");
            _prices[assets[i]] = prices[i];
            emit PriceUpdated(assets[i], prices[i]);
        }
    }

    /**
     * @dev Transfers ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PriceOracle: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
