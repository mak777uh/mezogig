// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test-only ERC-20 that tries to re-enter the escrow while a transfer is
///         in progress. Used to prove that `nonReentrant` actually holds on every
///         payout path. Never deployed anywhere.
contract ReentrantMUSD is ERC20, ERC20Permit {
    address public target;
    bytes public callData;
    bool public attackOn;
    bool public lastAttackReverted;

    constructor() ERC20("Reentrant MUSD", "rMUSD") ERC20Permit("Reentrant MUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm a one-shot reentrancy attempt that fires on the next transfer.
    function setAttack(address target_, bytes calldata data, bool on) external {
        target = target_;
        callData = data;
        attackOn = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (attackOn) {
            attackOn = false; // one shot, avoids infinite recursion
            (bool ok,) = target.call(callData);
            lastAttackReverted = !ok;
        }
        super._update(from, to, value);
    }
}
