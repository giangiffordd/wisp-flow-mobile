---
description: Launch wisp-flow-mobile in Expo Go via ngrok tunnel (PC has no WiFi card, phone connects over internet tunnel)
---

# Launch wisp-flow-mobile

## Context
- PC is Ethernet-only (no WiFi card) — LAN mode never works because router blocks wired↔wireless
- Tunnel mode (ngrok) is the only reliable method
- Phone uses Expo Go, logged in as @giangifford
- To connect: open Safari on iPhone → type `exp://<tunnel-url>` → iOS opens Expo Go automatically

## Steps

### 1. Kill any stale Metro processes
```powershell
$procs = Get-NetTCPConnection -LocalPort 8081,8082,8083 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $procs) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
```

### 2. Start Expo with tunnel (background)
```powershell
cd "f:\Downloads\React Native Projects\wisp-flow-mobile"
$env:CI = "0"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'f:\Downloads\React Native Projects\wisp-flow-mobile'; npx expo start --tunnel"
```
Wait ~20 seconds for Metro + ngrok to initialize.

### 3. Get the tunnel URL from ngrok API
```powershell
$tunnel = (Invoke-RestMethod "http://localhost:4040/api/tunnels").tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
$expUrl = "exp://" + ($tunnel.public_url -replace "https://", "")
Write-Host "Open this in Safari on iPhone: $expUrl"
```

### 4. Tell user the URL
Output the `exp://` URL clearly. The user opens **Safari on iPhone**, types the URL, and iOS redirects to Expo Go.

## Verification
Check `http://localhost:8081/status` returns `packager-status:running` and `http://localhost:4040/api/tunnels` returns a tunnel with `exp.direct` in the URL.

## Notes
- `@expo/ngrok` must be installed as a devDependency (already done: `npm install --save-dev @expo/ngrok@^4.1.3`)
- First tunnel connection takes ~15–30 seconds
- If port 8081 is busy and `CI=0` is not set, Expo will hang waiting for interactive input — always set `CI=0` or kill the old process first
