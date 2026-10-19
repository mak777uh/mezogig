# One-command post-deploy: deploy -> verify -> fill docs -> export ABI -> build frontend.
# Runs only if the deployer wallet has gas on Mezo Testnet.
#
#   powershell -ExecutionPolicy Bypass -File scripts/postdeploy.ps1
#
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== 1/6 balance check ==" -ForegroundColor Cyan
$out = & node -e "require('dotenv').config();const {ethers}=require('ethers');(async()=>{const p=new ethers.JsonRpcProvider(process.env.MEZO_RPC_URL);const w=new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY,p);console.log(w.address, ethers.formatEther(await p.getBalance(w.address)));})()" 2>&1
$parts = ($out | Out-String).Trim() -split "\s+"
$address = $parts[0]
$balance = [double]$parts[-1]
Write-Host "  $address : $balance BTC"
if ($balance -le 0) { Write-Host "  no gas yet — aborting" -ForegroundColor Yellow; exit 2 }

Write-Host "== 2/6 deploy ==" -ForegroundColor Cyan
& npx hardhat run scripts/deploy.js --network mezoTestnet
if ($LASTEXITCODE -ne 0) { throw "deploy failed" }
$receipt = Get-Content -Raw deployments/mezoTestnet.json | ConvertFrom-Json
$escrow = $receipt.escrow
$deployBlock = if ($receipt.blockNumber) { [string]$receipt.blockNumber } else { "0" }
Write-Host "  escrow: $escrow (block $deployBlock)"

Write-Host "== 3/6 verify (Sourcify v2 — the Mezo explorer has no Etherscan API) ==" -ForegroundColor Cyan
& node scripts/verify-sourcify.js
$verifyCode = $LASTEXITCODE
Write-Host "  verify exit: $verifyCode (0 = exact_match)"

Write-Host "== 4/6 fill docs ==" -ForegroundColor Cyan
& node scripts/finalize.js

Write-Host "== 5/6 export ABI + build frontend ==" -ForegroundColor Cyan
& node scripts/export-abi.js
Push-Location frontend
$env:VITE_ESCROW_ADDRESS = $escrow
$env:VITE_DEPLOY_BLOCK = $deployBlock
& npm run build
Pop-Location

Write-Host "== 6/6 read back on-chain ==" -ForegroundColor Cyan
$env:ESCROW_ADDRESS = $escrow
& node scripts/check-musd.js

Write-Host ""
Write-Host "DONE. escrow=$escrow" -ForegroundColor Green
Write-Host "explorer: https://explorer.test.mezo.org/address/$escrow"
Write-Host "next: add 2-3 read-only tx links → rebuild zip → submit"
