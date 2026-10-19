# EventHive — Replica Set Initializer
# Start mongod with mongo-rs/mongod-rs0.cfg first, then run this in a normal shell.
# This targets the project-local data path and port 27018; it does not alter the
# Windows MongoDB service or its separate data directory.

Set-StrictMode -Version Latest

Write-Host "`n=== EventHive: Initializing Replica Set ===" -ForegroundColor Cyan

# ── Step 1: Wait for mongod to be ready ───────────────────────────────────────
Write-Host "Waiting for mongod to accept connections..." -ForegroundColor Gray
$maxWait = 30
$waited  = 0
while ($waited -lt $maxWait) {
    try {
        $result = mongosh --host 127.0.0.1 --port 27018 --eval "db.runCommand({ping:1}).ok" --quiet 2>$null
        if ($result -eq '1') { break }
    } catch {}
    Start-Sleep -Seconds 1
    $waited++
}
if ($waited -ge $maxWait) {
    Write-Host "❌ mongod did not become ready in ${maxWait}s" -ForegroundColor Red
    exit 1
}
Write-Host "✅ mongod is accepting connections" -ForegroundColor Green

# ── Step 2: Check if already a replica set ────────────────────────────────────
$rsStatus = mongosh --host 127.0.0.1 --port 27018 --eval "try { JSON.stringify({ ok: 1, setName: rs.status().set }) } catch(e) { JSON.stringify({ ok: 0, codeName: e.codeName || e.name }) }" --quiet 2>$null
$status = $null
try { $status = $rsStatus | ConvertFrom-Json } catch {}
if ($status.ok -eq 1 -and $status.setName -eq 'rs0') {
    Write-Host "✅ Replica set rs0 already initialized" -ForegroundColor Green
} elseif ($status.ok -eq 0 -and $status.codeName -eq 'NotYetInitialized') {
    Write-Host "Initiating replica set rs0..." -ForegroundColor Cyan
    $initResult = mongosh --host 127.0.0.1 --port 27018 --eval "
      JSON.stringify(rs.initiate({
        _id: 'rs0',
        members: [{ _id: 0, host: '127.0.0.1:27018' }]
      }))
    " --quiet 2>&1
    Write-Host "initiate result: $initResult"
    Start-Sleep -Seconds 5
} else {
    Write-Host "❌ Replica-set status was unexpected; refusing to initialize: $rsStatus" -ForegroundColor Red
    exit 1
}

# ── Step 3: Verify PRIMARY ────────────────────────────────────────────────────
Write-Host "Waiting for PRIMARY election..." -ForegroundColor Gray
$maxWait = 20
$waited  = 0
$state   = ""
while ($waited -lt $maxWait) {
    $state = mongosh --host 127.0.0.1 --port 27018 --eval "rs.status().members[0].stateStr" --quiet 2>$null
    if ($state -eq 'PRIMARY') { break }
    Start-Sleep -Seconds 1
    $waited++
}

if ($state -eq 'PRIMARY') {
    Write-Host "✅ Replica set rs0 is PRIMARY" -ForegroundColor Green
} else {
    Write-Host "❌ PRIMARY not elected (state=$state). Check mongod.log" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 MongoDB Replica Set is fully configured and ready!" -ForegroundColor Green
Write-Host "   Connection string: mongodb://127.0.0.1:27018/eventhive?replicaSet=rs0" -ForegroundColor Yellow
Write-Host "   Next: npm run dev:backend" -ForegroundColor Yellow
