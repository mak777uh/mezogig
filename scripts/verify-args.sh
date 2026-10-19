#!/usr/bin/env bash
# Constructor arguments for the MezoGigEscrow deployment + the verification command.
#
# MezoGigEscrow is deployed with exactly two immutable constructor arguments:
#   1. the MUSD token address (Mezo testnet MUSD, 18 decimals)
#   2. the review period in seconds (148 for the public demo)
#
# The Mezo testnet explorer (Blockscout) has NO Etherscan-compatible API, so
# `hardhat verify` cannot verify there. The chain is supported by Sourcify, and
# verification goes through the Sourcify v2 endpoint (see scripts/verify-sourcify.js).
#
# Usage:
#   ./scripts/verify-args.sh                 # reads the address from deployments/mezoTestnet.json
#   ./scripts/verify-args.sh 0xYourEscrow    # explicit contract address
#   MUSD_ADDRESS=0x... REVIEW_PERIOD_SECONDS=148 ./scripts/verify-args.sh
set -euo pipefail

MUSD_ADDRESS="${MUSD_ADDRESS:-0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503}"
REVIEW_PERIOD_SECONDS="${REVIEW_PERIOD_SECONDS:-148}"

ESCROW_ADDRESS="${1:-}"
if [ -z "$ESCROW_ADDRESS" ]; then
  if [ -f "deployments/mezoTestnet.json" ]; then
    ESCROW_ADDRESS="$(node -e "console.log(require('./deployments/mezoTestnet.json').escrow)")"
    echo "escrow address taken from deployments/mezoTestnet.json: $ESCROW_ADDRESS"
  else
    echo "No escrow address given and deployments/mezoTestnet.json not found." >&2
    echo "Usage: $0 <escrow-address>" >&2
    exit 1
  fi
fi

cat <<EOF
=== MezoGigEscrow deployment facts ===
network:            mezoTestnet (chainId 31611)
explorer:           https://explorer.test.mezo.org/address/$ESCROW_ADDRESS
contract:           $ESCROW_ADDRESS
constructor arg 1:  $MUSD_ADDRESS          (MUSD token, address)
constructor arg 2:  $REVIEW_PERIOD_SECONDS (review period, uint256 seconds)
compiler:           0.8.28+commit.7893614a
settings:           optimizer enabled (200 runs), evmVersion london
=== verifying through Sourcify v2 ===
EOF

node scripts/verify-sourcify.js
