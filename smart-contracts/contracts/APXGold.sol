// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Assessment token; authorization does not prove physical gold custody.
contract APXGold is ERC20Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REDEEMER_ROLE = keccak256("REDEEMER_ROLE");

    mapping(address => bool) public isApproved;

    error InvalidAddress();
    error AccountNotApproved(address account);
    event ComplianceUpdated(address indexed account, bool approved);

    constructor(address admin) ERC20("APX-Gold", "APXG") {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setApproved(address account, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        isApproved[account] = approved;
        emit ComplianceUpdated(account, approved);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    /// @dev Only after off-chain custody and compliance approval; no reserve oracle.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Authorized operator burns with holder consent (ERC-20 allowance).
    /// @dev Call only after settlement approval. This does not release physical gold.
    function burnFrom(address holder, uint256 amount) external onlyRole(REDEEMER_ROLE) {
        _spendAllowance(holder, _msgSender(), amount);
        _burn(holder, amount);
    }

    /// @dev Delegated transfer operators must also be compliant.
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (!isApproved[_msgSender()]) revert AccountNotApproved(_msgSender());
        return super.transferFrom(from, to, value);
    }

    /// @dev Exempt only the zero mint/burn endpoint; pause covers all supply movement.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && !isApproved[from]) revert AccountNotApproved(from);
        if (to != address(0) && !isApproved[to]) revert AccountNotApproved(to);
        super._update(from, to, value);
    }
}
