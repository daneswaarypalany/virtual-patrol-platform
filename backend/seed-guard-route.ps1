# ============================================================
# Virtual Patrol - Rebuild "Full Site Patrol" with the GUARD checklist on ALL checkpoints
# Run from the backend folder with the backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-guard-route.ps1
# ============================================================

$base = "http://localhost:3000"

Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed. Run reset-admin.js if needed." -ForegroundColor Red; exit 1
}

# --- Tuas Cove ---
$sites = Invoke-RestMethod -Uri "$base/sites" -WebSession $s
$tuas = $sites | Where-Object { $_.name -like "*Tuas Cove*" }
if (-not $tuas) { Write-Host "Tuas Cove not found." -ForegroundColor Red; exit 1 }
$siteId = $tuas.id

# --- Cameras ---
$cameras = Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s
Write-Host "Cameras: $($cameras.Count)" -ForegroundColor Cyan

# --- Guard checklist ---
$checklists = Invoke-RestMethod -Uri "$base/checklists" -WebSession $s
$guard = $checklists | Where-Object { $_.name -eq "Security Guard Post & Duty Check" }
if (-not $guard) { Write-Host "Guard checklist not found." -ForegroundColor Red; exit 1 }
$guardId = $guard.id
Write-Host "Using checklist: $($guard.name)" -ForegroundColor Cyan

# --- All checkpoints use the guard checklist ---
$checkpoints = @()
foreach ($cam in $cameras) {
  $checkpoints += @{ cameraId = $cam.id; checklistTemplateId = $guardId }
}

# --- Delete old "Full Site Patrol" ---
$routes = Invoke-RestMethod -Uri "$base/routes?siteId=$siteId" -WebSession $s
$existing = $routes | Where-Object { $_.name -eq "Full Site Patrol" }
foreach ($r in $existing) {
  try {
    Invoke-RestMethod -Uri "$base/routes/$($r.id)" -Method Delete -WebSession $s | Out-Null
    Write-Host "Removed old 'Full Site Patrol'." -ForegroundColor DarkYellow
  } catch {}
}

# --- Create ---
$body = @{
  name             = "Full Site Patrol"
  siteId           = $siteId
  description      = "Complete site walk-through - guard duty checks"
  estimatedMinutes = 45
  checkpoints      = $checkpoints
} | ConvertTo-Json -Depth 6

try {
  $route = Invoke-RestMethod -Uri "$base/routes" -Method Post -ContentType "application/json" `
    -Body $body -WebSession $s
  Write-Host ""
  Write-Host "Done. '$($route.name)' created with $($checkpoints.Count) checkpoints, all using the guard checklist." -ForegroundColor Green
} catch {
  Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
}
