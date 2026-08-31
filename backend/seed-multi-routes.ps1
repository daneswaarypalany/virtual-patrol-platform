# ============================================================
# Virtual Patrol - Seed cameras + 15-checkpoint routes on 3 sites
# Run from backend folder with backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-multi-routes.ps1
# For each of 3 sites: ensures 15 cameras exist, then builds a 15-checkpoint route.
# ============================================================

$base = "http://localhost:3000"

Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed. Run reset-admin.js if needed." -ForegroundColor Red; exit 1
}

# Target sites (by name)
$targetNames = @(
  "Tuas Cove Industrial Centre",
  "City Gate",
  "Enterprise Centre"
)

# Camera template (15 per site)
$camTemplate = @(
  @{ name = "Main Gate";        loc = "Front entrance" },
  @{ name = "Loading Bay";      loc = "Rear dock" },
  @{ name = "Lobby";            loc = "Ground floor reception" },
  @{ name = "Car Park Level 1"; loc = "Basement parking" },
  @{ name = "Car Park Level 2"; loc = "Basement parking" },
  @{ name = "Perimeter East";   loc = "East boundary fence" },
  @{ name = "Perimeter West";   loc = "West boundary fence" },
  @{ name = "Perimeter North";  loc = "North boundary fence" },
  @{ name = "Perimeter South";  loc = "South boundary fence" },
  @{ name = "Warehouse Floor";  loc = "Main storage area" },
  @{ name = "Server Room";      loc = "IT room" },
  @{ name = "Emergency Exit A";  loc = "North stairwell" },
  @{ name = "Emergency Exit B";  loc = "South stairwell" },
  @{ name = "Rooftop";          loc = "Building roof access" },
  @{ name = "Side Entrance";    loc = "West pedestrian gate" }
)

# Get all sites + checklists once
$sites = Invoke-RestMethod -Uri "$base/sites" -WebSession $s
$checklists = Invoke-RestMethod -Uri "$base/checklists" -WebSession $s
if (-not $checklists -or $checklists.Count -eq 0) {
  Write-Host "No checklists found. Create at least one first." -ForegroundColor Red; exit 1
}
# prefer the guard checklist, else first
$guard = $checklists | Where-Object { $_.name -eq "Security Guard Post & Duty Check" }
$checklistId = if ($guard) { $guard.id } else { $checklists[0].id }
Write-Host "Using checklist: $(( $checklists | Where-Object { $_.id -eq $checklistId }).name)" -ForegroundColor Cyan
Write-Host ""

foreach ($siteName in $targetNames) {
  $site = $sites | Where-Object { $_.name -eq $siteName }
  if (-not $site) {
    Write-Host "Site not found: $siteName (skipping)" -ForegroundColor Red
    continue
  }
  $siteId = $site.id
  Write-Host "=== $siteName ===" -ForegroundColor Yellow

  # existing camera codes for this site
  $existing = @()
  try {
    $existing = (Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s) | ForEach-Object { $_.cameraCode }
  } catch {}

  # create cameras (codes are site-prefixed to stay globally unique)
  $prefix = ($siteName -replace '[^A-Za-z]','').Substring(0, [Math]::Min(4, ($siteName -replace '[^A-Za-z]','').Length)).ToUpper()
  $i = 1
  foreach ($cam in $camTemplate) {
    $code = "$prefix-{0:D3}" -f $i
    $i++
    if ($existing -contains $code) { continue }
    $body = @{
      name = $cam.name; cameraCode = $code; siteId = $siteId; location = $cam.loc
    } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$base/cameras" -Method Post -ContentType "application/json" -Body $body -WebSession $s | Out-Null
    } catch {}
  }

  # fetch this site's cameras (up to 15)
  $cams = Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s | Select-Object -First 15
  Write-Host "  Cameras: $($cams.Count)" -ForegroundColor DarkGray

  # build checkpoints
  $checkpoints = @()
  foreach ($c in $cams) {
    $checkpoints += @{ cameraId = $c.id; checklistTemplateId = $checklistId }
  }

  # remove existing "Full Site Patrol" for this site
  $routes = Invoke-RestMethod -Uri "$base/routes?siteId=$siteId" -WebSession $s
  foreach ($r in ($routes | Where-Object { $_.name -eq "Full Site Patrol" })) {
    try { Invoke-RestMethod -Uri "$base/routes/$($r.id)" -Method Delete -WebSession $s | Out-Null } catch {}
  }

  # create route
  $routeBody = @{
    name = "Full Site Patrol"; siteId = $siteId
    description = "Complete site walk-through"; estimatedMinutes = 45
    checkpoints = $checkpoints
  } | ConvertTo-Json -Depth 6

  try {
    Invoke-RestMethod -Uri "$base/routes" -Method Post -ContentType "application/json" -Body $routeBody -WebSession $s | Out-Null
    Write-Host "  Route created with $($checkpoints.Count) checkpoints." -ForegroundColor Green
  } catch {
    Write-Host "  Route FAILED: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
}

Write-Host "Done." -ForegroundColor Cyan
