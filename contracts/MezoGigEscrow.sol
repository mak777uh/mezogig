// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MezoGigEscrow
 * @notice Milestone-based freelance escrow settled in MUSD (Mezo USD, an ERC-20
 *         stablecoin pegged to the BTC-collateralised Mezo protocol).
 *
 *         The client funds the whole gig up-front (one transfer covering all
 *         milestones). Each milestone is released to the freelancer either by
 *         client approval, or automatically by the freelancer after a review
 *         period, or by the arbiter's percentage split in case of a dispute.
 *         Milestones that are not delivered before their deadline can be
 *         refunded to the client.
 *
 *         Security model:
 *         - no owner, no admin withdrawal, no platform fee: the contract only
 *           ever moves funds along the paths written above;
 *         - every payout is bounded by the milestone amount and every milestone
 *           settles exactly once (status machine), so total payouts can never
 *           exceed the deposit;
 *         - checks-effects-interactions + `nonReentrant` on all state-changing
 *           entry points; token access is via SafeERC20;
 *         - the token address is immutable, so a malicious token cannot be
 *           swapped in later.
 */
contract MezoGigEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Maximum number of milestones per gig (bounds gas and storage).
    uint256 public constant MAX_MILESTONES = 20;
    /// @notice Maximum review period (30 days) accepted at deploy time.
    uint256 public constant MAX_REVIEW_PERIOD = 30 days;

    /// @notice MUSD token used for every gig (immutable, no setter).
    IERC20 public immutable musd;

    /// @notice Seconds the client has to review a submitted milestone before the
    ///         freelancer can claim it automatically. Set at deploy time; a short
    ///         value (e.g. 180) is used for the public demo.
    uint256 public immutable reviewPeriod;

    enum GigStatus {
        Active,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending, // funded, not submitted yet
        Submitted, // freelancer delivered, waiting for review/claim
        Paid, // released to freelancer (client approval or auto-claim)
        Refunded, // returned to client after the deadline
        Disputed, // frozen, waiting for the arbiter
        Resolved // split by the arbiter
    }

    struct Milestone {
        uint128 amount; // MUSD amount held for this milestone
        uint64 deadline; // unix timestamp by which it must be submitted
        uint64 submittedAt; // unix timestamp of submission (0 if none)
        MilestoneStatus status;
        string proofURI; // IPFS/HTTPS link to the delivered work
    }

    struct Gig {
        address client;
        address freelancer;
        address arbiter; // address(0) = no arbitration for this gig
        uint64 createdAt;
        uint128 funded; // total MUSD deposited
        uint128 paidOut; // MUSD released to the freelancer so far
        uint128 refunded; // MUSD returned to the client so far
        GigStatus status;
        address cancelProposer; // address(0) while no cancellation is proposed
        string metadataURI; // gig description / brief
        Milestone[] milestones;
    }

    mapping(uint256 => Gig) private _gigs;

    /// @notice Number of gigs created so far; gig ids start at 1.
    uint256 public gigCount;

    event GigCreated(
        uint256 indexed gigId,
        address indexed client,
        address indexed freelancer,
        address arbiter,
        uint256 totalAmount,
        uint256 milestoneCount,
        string metadataURI
    );
    event MilestoneSubmitted(uint256 indexed gigId, uint256 indexed index, address freelancer, string proofURI);
    event MilestoneApproved(uint256 indexed gigId, uint256 indexed index, uint256 amount, address to);
    event MilestoneClaimed(uint256 indexed gigId, uint256 indexed index, uint256 amount, address to);
    event MilestoneRefunded(uint256 indexed gigId, uint256 indexed index, uint256 amount, address to);
    event DisputeOpened(uint256 indexed gigId, uint256 indexed index, address indexed by);
    event DisputeResolved(
        uint256 indexed gigId, uint256 indexed index, uint256 freelancerBps, uint256 freelancerAmount, uint256 clientAmount
    );
    event CancelProposed(uint256 indexed gigId, address indexed by);
    event CancelRevoked(uint256 indexed gigId, address indexed by);
    event GigCancelled(uint256 indexed gigId, uint256 clientRefund);

    error ZeroAddress();
    error NotClient();
    error NotFreelancer();
    error NotArbiter();
    error NotParty();
    error InvalidIndex();
    error InvalidState();
    error InvalidParams();
    error TooManyMilestones();
    error LengthMismatch();
    error DeadlineInPast();
    error DeadlinesNotIncreasing();
    error DeadlinePassed();
    error ReviewPeriodNotElapsed();
    error NoArbiter();
    error BadBps();
    error NothingToCancel();

    constructor(IERC20 musdToken, uint256 reviewPeriodSeconds) {
        if (address(musdToken) == address(0)) revert ZeroAddress();
        if (reviewPeriodSeconds == 0 || reviewPeriodSeconds > MAX_REVIEW_PERIOD) revert InvalidParams();
        musd = musdToken;
        reviewPeriod = reviewPeriodSeconds;
    }

    // ---------------------------------------------------------------------
    // Creation
    // ---------------------------------------------------------------------

    /**
     * @notice Create a gig and deposit the full amount of every milestone in MUSD.
     * @dev The caller must have approved this contract for at least `sum(amounts)`.
     * @param freelancer Address that will deliver the milestones.
     * @param amounts MUSD amount per milestone (18 decimals, > 0).
     * @param deadlines Unix timestamps (strictly increasing, in the future).
     * @param arbiter Address allowed to split disputed milestones; address(0) disables disputes.
     * @param metadataURI Link to the gig brief.
     */
    function createGig(
        address freelancer,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        address arbiter,
        string calldata metadataURI
    ) external nonReentrant returns (uint256 gigId) {
        uint256 total = _validate(freelancer, amounts, deadlines, arbiter);
        gigId = _create(freelancer, amounts, deadlines, arbiter, metadataURI, total);
    }

    /**
     * @notice Same as {createGig} but pays with an EIP-2612 permit instead of a
     *         separate `approve` transaction.
     * @dev A failing permit (e.g. the signature was front-run) is tolerated: the
     *      subsequent `safeTransferFrom` then reverts unless allowance exists.
     */
    function createGigWithPermit(
        address freelancer,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        address arbiter,
        string calldata metadataURI,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 gigId) {
        uint256 total = _validate(freelancer, amounts, deadlines, arbiter);
        try IERC20PermitLike(address(musd)).permit(msg.sender, address(this), total, permitDeadline, v, r, s) {} catch {}
        gigId = _create(freelancer, amounts, deadlines, arbiter, metadataURI, total);
    }

    // ---------------------------------------------------------------------
    // Milestone lifecycle
    // ---------------------------------------------------------------------

    /// @notice Freelancer submits a milestone before its deadline.
    function submitMilestone(uint256 gigId, uint256 index, string calldata proofURI) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.freelancer) revert NotFreelancer();
        if (gig.status != GigStatus.Active) revert InvalidState();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Pending) revert InvalidState();
        if (block.timestamp > m.deadline) revert DeadlinePassed();
        m.status = MilestoneStatus.Submitted;
        m.submittedAt = uint64(block.timestamp);
        m.proofURI = proofURI;
        emit MilestoneSubmitted(gigId, index, msg.sender, proofURI);
    }

    /// @notice Client accepts a submitted milestone; MUSD goes to the freelancer.
    function approveMilestone(uint256 gigId, uint256 index) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.client) revert NotClient();
        if (gig.status != GigStatus.Active) revert InvalidState();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Submitted) revert InvalidState();
        uint256 amount = m.amount;
        m.status = MilestoneStatus.Paid;
        gig.paidOut += uint128(amount);
        _settleIfComplete(gig);
        musd.safeTransfer(gig.freelancer, amount);
        emit MilestoneApproved(gigId, index, amount, gig.freelancer);
    }

    /// @notice Freelancer claims a submitted milestone after the review period
    ///         elapsed without a client decision (auto-approval).
    function claimMilestone(uint256 gigId, uint256 index) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.freelancer) revert NotFreelancer();
        if (gig.status != GigStatus.Active) revert InvalidState();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Submitted) revert InvalidState();
        if (block.timestamp < uint256(m.submittedAt) + reviewPeriod) revert ReviewPeriodNotElapsed();
        uint256 amount = m.amount;
        m.status = MilestoneStatus.Paid;
        gig.paidOut += uint128(amount);
        _settleIfComplete(gig);
        musd.safeTransfer(gig.freelancer, amount);
        emit MilestoneClaimed(gigId, index, amount, gig.freelancer);
    }

    /// @notice Client reclaims a milestone that was not submitted before its deadline.
    function refundExpired(uint256 gigId, uint256 index) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.client) revert NotClient();
        if (gig.status != GigStatus.Active) revert InvalidState();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Pending) revert InvalidState();
        if (block.timestamp <= m.deadline) revert DeadlinePassed();
        uint256 amount = m.amount;
        m.status = MilestoneStatus.Refunded;
        gig.refunded += uint128(amount);
        _settleIfComplete(gig);
        musd.safeTransfer(gig.client, amount);
        emit MilestoneRefunded(gigId, index, amount, gig.client);
    }

    // ---------------------------------------------------------------------
    // Disputes
    // ---------------------------------------------------------------------

    /// @notice Either party freezes a milestone and asks the arbiter to split it.
    function openDispute(uint256 gigId, uint256 index) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.client && msg.sender != gig.freelancer) revert NotParty();
        if (gig.status != GigStatus.Active) revert InvalidState();
        if (gig.arbiter == address(0)) revert NoArbiter();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Pending && m.status != MilestoneStatus.Submitted) revert InvalidState();
        m.status = MilestoneStatus.Disputed;
        emit DisputeOpened(gigId, index, msg.sender);
    }

    /**
     * @notice Arbiter splits a disputed milestone.
     * @param freelancerBps Share for the freelancer in basis points (0..10000);
     *        the remainder goes back to the client.
     */
    function resolveDispute(uint256 gigId, uint256 index, uint256 freelancerBps) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.arbiter) revert NotArbiter();
        if (gig.status != GigStatus.Active) revert InvalidState();
        if (freelancerBps > 10_000) revert BadBps();
        Milestone storage m = _milestone(gig, index);
        if (m.status != MilestoneStatus.Disputed) revert InvalidState();
        uint256 amount = m.amount;
        uint256 toFreelancer = (amount * freelancerBps) / 10_000;
        uint256 toClient = amount - toFreelancer;
        m.status = MilestoneStatus.Resolved;
        gig.paidOut += uint128(toFreelancer);
        gig.refunded += uint128(toClient);
        _settleIfComplete(gig);
        if (toFreelancer != 0) musd.safeTransfer(gig.freelancer, toFreelancer);
        if (toClient != 0) musd.safeTransfer(gig.client, toClient);
        emit DisputeResolved(gigId, index, freelancerBps, toFreelancer, toClient);
    }

    // ---------------------------------------------------------------------
    // Mutual cancellation
    // ---------------------------------------------------------------------

    /// @notice One party proposes to cancel the gig. Only allowed when no
    ///         milestone is submitted or disputed (those must be settled first).
    function proposeCancel(uint256 gigId) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (msg.sender != gig.client && msg.sender != gig.freelancer) revert NotParty();
        if (gig.status != GigStatus.Active) revert InvalidState();
        _requireNothingInFlight(gig);
        gig.cancelProposer = msg.sender;
        emit CancelProposed(gigId, msg.sender);
    }

    /// @notice The other party accepts the cancellation; all pending funds return to the client.
    function confirmCancel(uint256 gigId) external nonReentrant {
        Gig storage gig = _gig(gigId);
        address proposer = gig.cancelProposer;
        if (proposer == address(0)) revert NothingToCancel();
        if (msg.sender == proposer) revert InvalidState();
        if (msg.sender != gig.client && msg.sender != gig.freelancer) revert NotParty();
        if (gig.status != GigStatus.Active) revert InvalidState();
        _requireNothingInFlight(gig);

        uint256 refund;
        uint256 len = gig.milestones.length;
        for (uint256 i = 0; i < len; ++i) {
            Milestone storage m = gig.milestones[i];
            if (m.status == MilestoneStatus.Pending) {
                m.status = MilestoneStatus.Refunded;
                refund += m.amount;
            }
        }
        gig.cancelProposer = address(0);
        gig.refunded += uint128(refund);
        gig.status = GigStatus.Cancelled;
        musd.safeTransfer(gig.client, refund);
        emit GigCancelled(gigId, refund);
    }

    /// @notice Proposer withdraws their cancellation request.
    function revokeCancel(uint256 gigId) external nonReentrant {
        Gig storage gig = _gig(gigId);
        if (gig.cancelProposer != msg.sender) revert NotParty();
        gig.cancelProposer = address(0);
        emit CancelRevoked(gigId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getGig(uint256 gigId)
        external
        view
        returns (
            address client,
            address freelancer,
            address arbiter,
            uint64 createdAt,
            uint128 funded,
            uint128 paidOut,
            uint128 refunded,
            GigStatus status,
            address cancelProposer,
            string memory metadataURI,
            uint256 milestoneCount
        )
    {
        Gig storage gig = _gig(gigId);
        return (
            gig.client,
            gig.freelancer,
            gig.arbiter,
            gig.createdAt,
            gig.funded,
            gig.paidOut,
            gig.refunded,
            gig.status,
            gig.cancelProposer,
            gig.metadataURI,
            gig.milestones.length
        );
    }

    function getMilestone(uint256 gigId, uint256 index)
        external
        view
        returns (uint128 amount, uint64 deadline, uint64 submittedAt, MilestoneStatus status, string memory proofURI)
    {
        Milestone storage m = _milestone(_gig(gigId), index);
        return (m.amount, m.deadline, m.submittedAt, m.status, m.proofURI);
    }

    /// @notice Amount still held by the contract for this gig (not yet paid or refunded).
    function lockedAmount(uint256 gigId) external view returns (uint256 locked) {
        Gig storage gig = _gig(gigId);
        uint256 len = gig.milestones.length;
        for (uint256 i = 0; i < len; ++i) {
            MilestoneStatus s = gig.milestones[i].status;
            if (s == MilestoneStatus.Pending || s == MilestoneStatus.Submitted || s == MilestoneStatus.Disputed) {
                locked += gig.milestones[i].amount;
            }
        }
    }

    /// @notice Unix timestamp after which the freelancer may auto-claim a submitted milestone.
    function claimableAt(uint256 gigId, uint256 index) external view returns (uint256) {
        Milestone storage m = _milestone(_gig(gigId), index);
        if (m.status != MilestoneStatus.Submitted) return 0;
        return uint256(m.submittedAt) + reviewPeriod;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _gig(uint256 gigId) private view returns (Gig storage gig) {
        gig = _gigs[gigId];
        if (gig.client == address(0)) revert InvalidIndex();
    }

    function _milestone(Gig storage gig, uint256 index) private view returns (Milestone storage m) {
        if (index >= gig.milestones.length) revert InvalidIndex();
        m = gig.milestones[index];
    }

    function _validate(address freelancer, uint256[] calldata amounts, uint64[] calldata deadlines, address arbiter)
        private
        view
        returns (uint256 total)
    {
        if (freelancer == address(0)) revert ZeroAddress();
        if (freelancer == msg.sender) revert InvalidParams();
        if (arbiter == msg.sender || (arbiter != address(0) && arbiter == freelancer)) revert InvalidParams();
        uint256 len = amounts.length;
        if (len == 0) revert InvalidParams();
        if (len != deadlines.length) revert LengthMismatch();
        if (len > MAX_MILESTONES) revert TooManyMilestones();
        for (uint256 i = 0; i < len; ++i) {
            if (amounts[i] == 0) revert InvalidParams();
            if (deadlines[i] <= block.timestamp) revert DeadlineInPast();
            if (i > 0 && deadlines[i] <= deadlines[i - 1]) revert DeadlinesNotIncreasing();
            total += amounts[i];
        }
        if (total > type(uint128).max) revert InvalidParams();
    }

    function _create(
        address freelancer,
        uint256[] calldata amounts,
        uint64[] calldata deadlines,
        address arbiter,
        string calldata metadataURI,
        uint256 total
    ) private returns (uint256 gigId) {
        gigId = ++gigCount;
        Gig storage gig = _gigs[gigId];
        gig.client = msg.sender;
        gig.freelancer = freelancer;
        gig.arbiter = arbiter;
        gig.createdAt = uint64(block.timestamp);
        gig.funded = uint128(total);
        gig.status = GigStatus.Active;
        gig.metadataURI = metadataURI;
        for (uint256 i = 0; i < amounts.length; ++i) {
            gig.milestones.push(
                Milestone({
                    amount: uint128(amounts[i]),
                    deadline: deadlines[i],
                    submittedAt: 0,
                    status: MilestoneStatus.Pending,
                    proofURI: ""
                })
            );
        }
        musd.safeTransferFrom(msg.sender, address(this), total);
        emit GigCreated(gigId, msg.sender, freelancer, arbiter, total, amounts.length, metadataURI);
    }

    function _settleIfComplete(Gig storage gig) private {
        uint256 len = gig.milestones.length;
        for (uint256 i = 0; i < len; ++i) {
            MilestoneStatus s = gig.milestones[i].status;
            if (s == MilestoneStatus.Pending || s == MilestoneStatus.Submitted || s == MilestoneStatus.Disputed) {
                return;
            }
        }
        gig.status = GigStatus.Completed;
    }

    function _requireNothingInFlight(Gig storage gig) private view {
        uint256 len = gig.milestones.length;
        for (uint256 i = 0; i < len; ++i) {
            MilestoneStatus s = gig.milestones[i].status;
            if (s == MilestoneStatus.Submitted || s == MilestoneStatus.Disputed) revert InvalidState();
        }
    }
}

interface IERC20PermitLike {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}
