# ============================================================
# Virtual Patrol - Rebuild "Full Site Patrol" with smart checklist mapping
# Run from the backend folder with the backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-smart-route.ps1
# Maps each Tuas Cove camera to the best-fitting checklist by keyword.
# Deletes the old "Full Site Patrol" if it exists, then recreates it.
# ============================================================

$base = "http://localhost:3000"

Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed." -ForegroundColor Red; exit 1
}

# --- Tuas Cove ---
$sites = Invoke-RestMethod -Uri "$base/sites" -WebSession $s
$tuas = $sites | Where-Object { $_.name -like "*Tuas Cove*" }
if (-not $tuas) { Write-Host "Tuas Cove not found." -ForegroundColor Red; exit 1 }
$siteId = $tuas.id

# --- Cameras ---
$cameras = Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s
Write-Host "Cameras: $($cameras.Count)" -ForegroundColor Cyan

# --- Checklists (build a name -> id lookup) ---
$checklists = Invoke-RestMethod -Uri "$base/checklists" -WebSession $s
$byName = @{}
foreach ($c in $checklists) { $byName[$c.name] = $c.id }

$perimeter = $byName["Perimeter Check"]
$entrance  = $byName["Main Entrance Check"]
$general   = $byName["Security Guard Post & Duty Check"]

# fallback: if any is missing, use the first available checklist
$fallback = $checklists[0].id
if (-not $perimeter) { $perimeter = $fallback }
if (-not $entrance)  { $entrance  = $fallback }
if (-not $general)   { $general   = $fallback }

# --- Map each camera to a checklist by keyword ---
function Pick-Checklist($name) {
  $n = $name.ToLower()
  if ($n -match "perimeter") { return $perimeter }
  if ($n -match "gate|entrance|lobby|reception|door") { return $entrance }
  return $general
}

$checkpoints = @()
foreach ($cam in $cameras) {
  $clId = Pick-Checklist $cam.name
  $checkpoints += @{ cameraId = $cam.id; checklistTemplateId = $clId }
  $clName = ($checklists | Where-Object { $_.id -eq $clId }).name
  Write-Host "  $($cam.name)  ->  $clName" -ForegroundColor DarkGray
}

# --- Delete existing "Full Site Patrol" so we don't duplicate ---
$routes = Invoke-RestMethod -Uri "$base/routes?siteId=$siteId" -WebSession $s
$existing = $routes | Where-Object { $_.name -eq "Full Site Patrol" }
foreach ($r in $existing) {
  try {
    Invoke-RestMethod -Uri "$base/routes/$($r.id)" -Method Delete -WebSession $s | Out-Null
    Write-Host "Removed old 'Full Site Patrol'." -ForegroundColor DarkYellow
  } catch {}
}

# --- Create the route ---
$body = @{
  name             = "Full Site Patrol"
  siteId           = $siteId
  description      = "Complete site walk-through with per-area checklists"
  estimatedMinutes = 45
  checkpoints      = $checkpoints
} | ConvertTo-Json -Depth 6

try {
  $route = Invoke-RestMethod -Uri "$base/routes" -Method Post -ContentType "application/json" `
    -Body $body -WebSession $s
  Write-Host ""
  Write-Host "Done. '$($route.name)' created with $($checkpoints.Count) checkpoints and mapped checklists." -ForegroundColor Green
} catch {
  Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
}
