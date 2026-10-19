# EventHive — MongoDB Replica Set Setup Script
# Run this in an ADMINISTRATOR PowerShell window
# (Right-click Start → Windows PowerShell (Admin) or Terminal (Admin))
#
# This script:
#   1. Backs up mongod.cfg
#   2. Adds the replication block
#   3. Restarts the MongoDB service
#
# After this completes, run init-replica-set.ps1 in a NORMAL shell.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cfgPath    = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"
$backupPath = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg.backup-before-rs0"

Write-Host "`n=== EventHive: MongoDB Replica-Set Setup (Admin) ===" -ForegroundColor Cyan

# ── Step 1: Backup ────────────────────────────────────────────────────────────
if (Test-Path $backupPath) {
    Write-Host "✅ Backup already exists at: $backupPath" -ForegroundColor Green
} else {
    Copy-Item $cfgPath $backupPath
    Write-Host "✅ Backed up mongod.cfg to: $backupPath" -ForegroundColor Green
}

# ── Step 2: Check if already configured ───────────────────────────────────────
$content = Get-Content $cfgPath -Raw
if ($content -match 'replSetName') {
    Write-Host "✅ Replica-set already configured in mongod.cfg" -ForegroundColor Green
} else {
    # Replace commented #replication: with the replication block
    $updated = $content -replace '#replication:', "replication:`r`n  replSetName: `"rs0`""
    Set-Content -Path $cfgPath -Value $updated -Encoding UTF8
    Write-Host "✅ Added replication block to mongod.cfg" -ForegroundColor Green
}

# ── Step 3: Verify the change ─────────────────────────────────────────────────
Write-Host "`nVerifying mongod.cfg:" -ForegroundColor Cyan
Get-Content $cfgPath | Select-String "replication" -Context 0,2

# ── Step 4: Restart MongoDB service ───────────────────────────────────────────
Write-Host "`nRestarting MongoDB service..." -ForegroundColor Cyan
Restart-Service MongoDB
Start-Sleep -Seconds 3

$svc = Get-Service MongoDB
Write-Host "Service status: $($svc.Status)" -ForegroundColor $(if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' })

if ($svc.Status -ne 'Running') {
    Write-Host "❌ MongoDB service failed to start. Check: C:\Program Files\MongoDB\Server\8.2\log\mongod.log" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Admin setup complete!" -ForegroundColor Green
Write-Host "Next: Open a NORMAL shell and run: .\mongo-rs\init-replica-set.ps1" -ForegroundColor Yellow
