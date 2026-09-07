# ============================================================
# Virtual Patrol - Seed Hillview / Chuan / Kovan
#   - 7 area-type checklist templates (10 items each)
#   - 65 cameras (site-prefixed codes)
#   - 3 routes, each checkpoint mapped to a fitting checklist by keyword
# Run from backend folder with backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-estates.ps1
# ============================================================

$base = "http://localhost:3000"

Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed. Run reset-admin.js if needed." -ForegroundColor Red; exit 1
}

# ---------- 1. Checklist templates (10 items each) ----------
$templates = @(
  @{ name = "Guardhouse Check"; category = "Security Operations"; items = @(
    "Guard on duty and alert", "Occurrence book up to date", "Visitor register maintained",
    "Access control system working", "Communication radio functional", "CCTV monitors operational",
    "Keys accounted for", "Emergency contact list present", "Guardhouse clean and orderly",
    "Barrier controls functional") },
  @{ name = "Carpark Check"; category = "Perimeter"; items = @(
    "No unauthorized vehicles", "Lighting functional", "No obstruction in lanes",
    "Fire lane kept clear", "No suspicious items", "Parking lots properly marked",
    "Ventilation running", "No oil spills or hazards", "CCTV view unobstructed",
    "Ramp and gates operational") },
  @{ name = "Equipment Room Check"; category = "Equipment"; items = @(
    "Room locked and secure", "No water leakage", "Equipment running normally",
    "No unusual noise or smell", "Temperature normal", "No warning indicators lit",
    "Fire extinguisher present", "No unauthorized access signs", "Cabling intact",
    "Access log updated") },
  @{ name = "Common Area Check"; category = "Facilities"; items = @(
    "Area clean and tidy", "Lighting functional", "Facilities in working order",
    "No damage or vandalism", "No unauthorized persons", "Furniture intact",
    "Emergency exits clear", "No safety hazards", "Signage visible",
    "CCTV coverage clear") },
  @{ name = "Access Point Check"; category = "Access Control"; items = @(
    "Gate/door secured", "Intercom functional", "Access reader working",
    "No tailgating observed", "Lock mechanism intact", "No forced-entry signs",
    "Lighting adequate", "CCTV view clear", "Signage present",
    "Emergency release functional") },
  @{ name = "Management Office Check"; category = "Security Operations"; items = @(
    "Office secured after hours", "No unauthorized access", "Windows and doors locked",
    "Alarm system armed", "No suspicious activity", "Lighting off/appropriate",
    "Confidential documents secured", "CCTV operational", "Keys secured",
    "No safety hazards") },
  @{ name = "General Patrol Check"; category = "General"; items = @(
    "Area secure", "No unauthorized personnel", "Lighting functional",
    "No obstruction in view", "No signs of tampering", "No safety hazards",
    "Emergency access clear", "CCTV view unobstructed", "Surroundings normal",
    "No suspicious items") }
)

Write-Host "Creating checklist templates..." -ForegroundColor Cyan
# fetch existing to avoid duplicates
$existingTemplates = @{}
try {
  (Invoke-RestMethod -Uri "$base/checklists" -WebSession $s) | ForEach-Object {
    $existingTemplates[$_.name] = $_.id
  }
} catch {}

$templateIds = @{}
foreach ($t in $templates) {
  if ($existingTemplates.ContainsKey($t.name)) {
    $templateIds[$t.name] = $existingTemplates[$t.name]
    Write-Host "  exists: $($t.name)" -ForegroundColor DarkGray
    continue
  }
  $body = @{
    name = $t.name; description = "Standard $($t.name)"; category = $t.category
    items = @($t.items | ForEach-Object { @{ label = $_ } })
  } | ConvertTo-Json -Depth 5
  $created = Invoke-RestMethod -Uri "$base/checklists" -Method Post -ContentType "application/json" -Body $body -WebSession $s
  $templateIds[$t.name] = $created.id
  Write-Host "  created: $($t.name)" -ForegroundColor Green
}

# ---------- keyword -> template mapping ----------
function Pick-Template($name) {
  $n = $name.ToLower()
  if ($n -match "guardhouse|guard house") { return $templateIds["Guardhouse Check"] }
  if ($n -match "management office") { return $templateIds["Management Office Check"] }
  if ($n -match "carpark|car park|cp lot|lot \d|parking") { return $templateIds["Carpark Check"] }
  if ($n -match "mdf|pump|switch room|water tank|water transfer|\bdb\b|store room") { return $templateIds["Equipment Room Check"] }
  if ($n -match "gym|tennis|basketball|bbq|pool|landscape|laundry|rooftop|terrace|function room") { return $templateIds["Common Area Check"] }
  if ($n -match "gate|barrier|turnstile|intercom|lift lobby|letter box|access|bollard|side gate") { return $templateIds["Access Point Check"] }
  return $templateIds["General Patrol Check"]
}

# ---------- 2 & 3. Sites -> cameras -> route ----------
$sites = Invoke-RestMethod -Uri "$base/sites" -WebSession $s

$estates = @(
  @{ siteMatch = "Hillview 128"; prefix = "HILL"; routeName = "Hillview 128 Clocking Route"; points = @(
    "Guardhouse","126A Letter Box/Lift","126B Letter Box/Lift","Function Room","MDF Room",
    "Rooftop Terrace Gateway","Store Room","Slope (beside Store Room)","Bin Centre Gate",
    "Swing Gate (Back Gate)","128 Letter Box/Lift","Swimming Pool (128 Corner)","Swimming Pool Chair",
    "126A Side","Car Park Lot 56 (126A Left)","Near Domestic Water Tank B128","Car Park Lot 12 Pillar",
    "Car Park Lot 6","Management Office","Exit Barrier") },
  @{ siteMatch = "The Chuan"; prefix = "CHUAN"; routeName = "Chuan Clocking Route"; points = @(
    "Carpark B1 Lot 30","Carpark B1 Lot 55","Carpark B2 Lot 86","Carpark B2 Lot 111","Gym",
    "Basketball Court","Tennis Court","Function Room","2nd Floor Landscape","Management Office",
    "Visitor's Carpark","Bin Centre","Guardhouse") },
  @{ siteMatch = "Kovan Residence"; prefix = "KOVAN"; routeName = "Kovan Residences Clocking Route"; points = @(
    "Guard House","Outside Intercom of Blk 1 Lift Lobby","Blk 1 Front Access Area",
    "Club House (outside Function Room)","Consumer Switch Room (Cleaner Rest Area)",
    "Basement Sprinkler Pump Room (EV Charging CP Lot 56)","Sump Pump Control Panel (Blk 7 CP Lot 10)",
    "MDF (Blk 7 CP Lot 205)","Consumer Switch Room (Blk 7 CP Lot 194)",
    "Domestic Water Transfer Pump Room (CP Lot 169)","Lvl 1 Lift Lobby (near SPX Box)",
    "Lvl 1 Carpark Store Door (CP Lot 42)","Lvl 1 Carpark Technician Room Door (CP Lot 51)",
    "Bin Centre (beside gate)","Lvl 1 Carpark DB Blk 1A Lot 92","Lvl 1 Carpark DB Blk 7 Lot 15",
    "Blk 5 Facing Kovan Rd (pillar)","Blk 7 Facing Lowland Rd (bollard)","Side Gate - Lowland Rd",
    "BBQ Area","Side Gate (near turnstile)","Tennis Court","Laundry Room (behind male toilet)",
    "Blk 3A Access Gate (intercom)","Blk 5A Access Gate (intercom)","Blk 7A Access Gate (intercom)",
    "BBQ Pit outside Dining Pavilion","Blk 7 Access Gate (intercom)","Blk 5 Access Gate (intercom)",
    "Gymnasium","Blk 3 Access Gate (intercom)","Management Office Blk 1A") }
)

foreach ($estate in $estates) {
  $site = $sites | Where-Object { $_.name -like "*$($estate.siteMatch)*" }
  if (-not $site) { Write-Host "Site not found: $($estate.siteMatch)" -ForegroundColor Red; continue }
  $siteId = $site.id
  Write-Host "=== $($site.name) ($($estate.points.Count) points) ===" -ForegroundColor Yellow

  # existing camera codes at this site
  $existingCodes = @()
  try { $existingCodes = (Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s) | ForEach-Object { $_.cameraCode } } catch {}

  $checkpoints = @()
  $i = 1
  foreach ($pt in $estate.points) {
    $code = "$($estate.prefix)-{0:D2}" -f $i
    $i++
    # create camera if not exists
    $cam = $null
    if ($existingCodes -contains $code) {
      $cam = (Invoke-RestMethod -Uri "$base/cameras?siteId=$siteId" -WebSession $s) | Where-Object { $_.cameraCode -eq $code } | Select-Object -First 1
    } else {
      $camBody = @{ name = $pt; cameraCode = $code; siteId = $siteId; location = $pt } | ConvertTo-Json
      try {
        $cam = Invoke-RestMethod -Uri "$base/cameras" -Method Post -ContentType "application/json" -Body $camBody -WebSession $s
      } catch {
        Write-Host "  cam FAILED: $pt" -ForegroundColor Red; continue
      }
    }
    $checkpoints += @{ cameraId = $cam.id; checklistTemplateId = (Pick-Template $pt) }
  }
  Write-Host "  cameras ready: $($checkpoints.Count)" -ForegroundColor DarkGray

  # remove existing route of same name
  $routes = Invoke-RestMethod -Uri "$base/routes?siteId=$siteId" -WebSession $s
  foreach ($r in ($routes | Where-Object { $_.name -eq $estate.routeName })) {
    try { Invoke-RestMethod -Uri "$base/routes/$($r.id)" -Method Delete -WebSession $s | Out-Null } catch {}
  }

  $routeBody = @{
    name = $estate.routeName; siteId = $siteId
    description = "Full clocking route"; estimatedMinutes = ($estate.points.Count * 3)
    checkpoints = $checkpoints
  } | ConvertTo-Json -Depth 6

  try {
    Invoke-RestMethod -Uri "$base/routes" -Method Post -ContentType "application/json" -Body $routeBody -WebSession $s | Out-Null
    Write-Host "  route created: $($estate.routeName) ($($checkpoints.Count) checkpoints)" -ForegroundColor Green
  } catch {
    Write-Host "  route FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
  }
  Write-Host ""
}

Write-Host "Done." -ForegroundColor Cyan
