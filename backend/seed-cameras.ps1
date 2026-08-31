# ============================================================
# Virtual Patrol - Seed 15 cameras at Tuas Cove
# Run from the backend folder with the backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-cameras.ps1
# Logs in as admin, finds Tuas Cove, creates cameras (skips duplicates by code).
# ============================================================

$base = "http://localhost:3000"

# --- Log in as admin ---
Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed. Is the backend running? Is admin/admin123 correct?" -ForegroundColor Red
  exit 1
}

# --- Find Tuas Cove ---
$sites = Invoke-RestMethod -Uri "$base/sites" -WebSession $s
$tuas = $sites | Where-Object { $_.name -like "*Tuas Cove*" }
if (-not $tuas) {
  Write-Host "Could not find Tuas Cove site." -ForegroundColor Red
  exit 1
}
$siteId = $tuas.id
Write-Host "Target site: $($tuas.name)" -ForegroundColor Cyan

# --- Existing camera codes at this site (avoid duplicates) ---
$existingCodes = @()
try {
  $existingCodes = (Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s) | ForEach-Object { $_.cameraCode }
} catch {}

# --- 15 realistic cameras ---
$cameras = @(
  @{ name = "Main Gate";          code = "CAM-001"; location = "Front entrance" },
  @{ name = "Loading Bay";        code = "CAM-002"; location = "Rear dock" },
  @{ name = "Lobby";              code = "CAM-003"; location = "Ground floor reception" },
  @{ name = "Car Park Level 1";   code = "CAM-004"; location = "Basement parking" },
  @{ name = "Car Park Level 2";   code = "CAM-005"; location = "Basement parking" },
  @{ name = "Perimeter East";     code = "CAM-006"; location = "East boundary fence" },
  @{ name = "Perimeter West";     code = "CAM-007"; location = "West boundary fence" },
  @{ name = "Perimeter North";    code = "CAM-008"; location = "North boundary fence" },
  @{ name = "Perimeter South";    code = "CAM-009"; location = "South boundary fence" },
  @{ name = "Warehouse Floor";    code = "CAM-010"; location = "Main storage area" },
  @{ name = "Server Room";        code = "CAM-011"; location = "IT room, level 2" },
  @{ name = "Emergency Exit A";   code = "CAM-012"; location = "North stairwell" },
  @{ name = "Emergency Exit B";   code = "CAM-013"; location = "South stairwell" },
  @{ name = "Rooftop";            code = "CAM-014"; location = "Building roof access" },
  @{ name = "Side Entrance";      code = "CAM-015"; location = "West pedestrian gate" }
)

$created = 0
$skipped = 0

foreach ($cam in $cameras) {
  if ($existingCodes -contains $cam.code) {
    Write-Host "  skip (exists): $($cam.code) $($cam.name)" -ForegroundColor DarkGray
    $skipped++
    continue
  }

  $body = @{
    name       = $cam.name
    cameraCode = $cam.code
    siteId     = $siteId
    location   = $cam.location
  } | ConvertTo-Json

  try {
    Invoke-RestMethod -Uri "$base/cameras" -Method Post -ContentType "application/json" `
      -Body $body -WebSession $s | Out-Null
    Write-Host "  created: $($cam.code) $($cam.name)" -ForegroundColor Green
    $created++
  } catch {
    Write-Host "  FAILED: $($cam.name) - $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Done. Created $created, skipped $skipped." -ForegroundColor Cyan
