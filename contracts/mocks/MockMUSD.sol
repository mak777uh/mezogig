// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Local-only stand-in for Mezo testnet MUSD (18 decimals, EIP-2612 permit).
///         Never deployed to production; used by the Hardhat tests.
contract MockMUSD is ERC20, ERC20Permit {
    constructor() ERC20("Mock Mezo USD", "MUSD") ERC20Permit("Mock Mezo USD") {
        _mint(msg.sender, 1_000_000e18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
