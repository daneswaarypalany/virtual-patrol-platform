# ============================================================
# Virtual Patrol - Seed 21 sites via the API
# Run from anywhere with the backend running:
#   powershell -ExecutionPolicy Bypass -File .\seed-sites.ps1
# Logs in as admin, then creates each site (skips duplicates by name).
# ============================================================

$base = "http://localhost:3000"

# --- Log in as admin ---
Write-Host "Logging in as admin..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
    -Body '{"username":"admin","password":"admin123"}' -SessionVariable s | Out-Null
} catch {
  Write-Host "Login failed. Is the backend running? Is the admin password admin123?" -ForegroundColor Red
  exit 1
}

# --- Site data (name, address) ---
$sites = @(
  @{ name = "Hedges Park"; address = "91 Flora Drive, 506891" },
  @{ name = "The Santorini"; address = "21 Tampines Street 86, 528592" },
  @{ name = "Springfield"; address = "1 Chempaka Kuning Link, 486236" },
  @{ name = "Elliot at the East Coast"; address = "21 Elliot Road, 458711" },
  @{ name = "Simsville"; address = "2 Geylang East Avenue 2, 389754" },
  @{ name = "Country Esquire"; address = "20 Lorong Puntong, 576438" },
  @{ name = "North Gaia"; address = "25 Yishun Close, 769341" },
  @{ name = "Kovan Residence"; address = "1 Kovan Road, 544915" },
  @{ name = "Seasons View"; address = "5 Pemimpin Drive, 576149" },
  @{ name = "The Chuan"; address = "31 Lorong Chuan, 556820" },
  @{ name = "Cradels"; address = "10 Lorong Limau, 328754" },
  @{ name = "Balmoral Residence"; address = "12 Balmoral Crescent, 259905" },
  @{ name = "Terrene at Bukit Timah"; address = "121 Jalan Jurong Kechil, 598679" },
  @{ name = "The Creek @ Bukit"; address = "19 Toh Tuck Road, 596683" },
  @{ name = "Hillview 128"; address = "128 Hillview Avenue, 669595" },
  @{ name = "Singapore Hokkien Huay Kuan Cultural Academy"; address = "5 Sennett Road, 466781" },
  @{ name = "SHHK Tower"; address = "137 Telok Ayer Street, 068602" },
  @{ name = "Eunos Warehouse Complex"; address = "1 Kaki Bukit Road 2, 417835" },
  @{ name = "City Gate"; address = "371 Beach Road, 199597" },
  @{ name = "Enterprise Centre"; address = "20 Bukit Batok Crescent, 658080" },
  @{ name = "Tuas Cove Industrial Centre"; address = "53 Tuas South Avenue 1, 637259" }
)

# --- Fetch existing site names to avoid duplicates ---
$existing = @()
try {
  $existing = (Invoke-RestMethod -Uri "$base/sites" -WebSession $s) | ForEach-Object { $_.name }
} catch {}

$created = 0
$skipped = 0

foreach ($site in $sites) {
  if ($existing -contains $site.name) {
    Write-Host "  skip (exists): $($site.name)" -ForegroundColor DarkGray
    $skipped++
    continue
  }

  $body = @{
    name     = $site.name
    address  = $site.address
    timezone = "Asia/Singapore"
    isActive = $true
  } | ConvertTo-Json

  try {
    Invoke-RestMethod -Uri "$base/sites" -Method Post -ContentType "application/json" `
      -Body $body -WebSession $s | Out-Null
    Write-Host "  created: $($site.name)" -ForegroundColor Green
    $created++
  } catch {
    Write-Host "  FAILED: $($site.name) - $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Done. Created $created, skipped $skipped." -ForegroundColor Cyan
