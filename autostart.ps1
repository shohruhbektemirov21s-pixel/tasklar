# TeamFlow Loyihasini kompyuter yoqilganda avtomatik fonda ishga tushirish skripti
# Joylashuvi: D:\Task\autostart.ps1

$ErrorActionPreference = "Continue"
$projectDir = "D:\Task"
$logPath = "$projectDir\autostart.log"
$composeFile = "$projectDir\docker-compose.yml"

# ==============================================================================
# 1. LOG TIZIMI VA HAJMNI NAZORAT QILISH
# ==============================================================================
function Log-Message {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Output $logLine
    try {
        Add-Content -Path $logPath -Value $logLine -Encoding utf8
    } catch {}
}

function Trim-LogFile {
    try {
        if (Test-Path $logPath) {
            $fileItem = Get-Item $logPath
            if ($fileItem.Length -gt 1MB) {
                $lines = Get-Content $logPath -Tail 300
                $lines | Set-Content $logPath -Encoding utf8
                Log-Message "Log fayli hajmi 1MB dan oshgani sababli oxirgi 300 qator saqlab qolindi." "INFO"
            }
        }
    } catch {}
}

Trim-LogFile
Log-Message "=== TeamFlow avtomatik ishga tushirish jarayoni boshlandi ===" "INFO"

# ==============================================================================
# 2. WINDOWS TOAST BILDIRISHNOMASI
# ==============================================================================
function Show-Notification {
    param(
        [string]$Title,
        [string]$Message,
        [string]$Type = "Info"
    )
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

        $template = "<toast><visual><binding template='ToastGeneric'><text>$Title</text><text>$Message</text></binding></visual></toast>"
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("TeamFlow")
        $notifier.Show($toast)
    } catch {
        # Bildirishnoma chiqmasa ham skript to'xtamasligi kerak
    }
}

# ==============================================================================
# 3. DOCKER DESKTOP VA DEMONINI TEKSHIRISH
# ==============================================================================
$dockerDesktopPaths = @(
    "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
)

$dockerDesktopExe = $null
foreach ($p in $dockerDesktopPaths) {
    if (Test-Path $p) {
        $dockerDesktopExe = $p
        break
    }
}

$maxWaitSeconds = 180
$startTime = Get-Date
$dockerReady = $false

Log-Message "Docker demoni holati tekshirilmoqda..." "INFO"

while (-not $dockerReady) {
    $elapsed = [int]((Get-Date) - $startTime).TotalSeconds
    if ($elapsed -ge $maxWaitSeconds) {
        break
    }

    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "docker"
        $psi.Arguments = "info"
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        if ($p.WaitForExit(5000) -and $p.ExitCode -eq 0) {
            $dockerReady = $true
            Log-Message "Docker demoni tayyor va ishlamoqda (${elapsed}s ichida)." "INFO"
            break
        }
    } catch {}

    # Agar Docker jarayoni umuman yo'q bo'lsa, uni ishga tushiramiz
    $dockerProc = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $dockerProc -and $dockerDesktopExe) {
        Log-Message "Docker Desktop ishga tushirilmoqda: $dockerDesktopExe" "INFO"
        Start-Process -FilePath $dockerDesktopExe
    }

    Log-Message "Docker ishga tushishi kutilmoqda... (${elapsed}s / ${maxWaitSeconds}s)" "INFO"
    Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
    Log-Message "XATOLIK: Docker ${maxWaitSeconds}s ichida ishga tushmadi." "ERROR"
    Show-Notification "TeamFlow Xatolik" "Docker xizmati ishga tushmadi. autostart.log ni tekshiring." "Error"
    exit 1
}

# ==============================================================================
# 4. DOCKER COMPOSE KONTEYNERLARINI ISHGA TUSHIRISH (REAL-TIME STREAMING)
# ==============================================================================
Log-Message "Docker Compose konteynerlari ishga tushirilmoqda ($composeFile)..." "INFO"
Set-Location -Path $projectDir

try {
    & docker compose -f $composeFile up -d 2>$null | Out-Null
    Log-Message "Docker compose buyrug'i muvaffaqiyatli yuborildi." "INFO"
} catch {
    Log-Message "Docker compose bajarishda xatolik: $_" "ERROR"
}

# ==============================================================================
# 5. SERVISLAR SALOMATLIGINI (HEALTH) BOSQICHMA-BOSQICH KUTISH
# ==============================================================================
$healthStart = Get-Date
$maxHealthWait = 180
$allHealthy = $false

Log-Message "Servislar salomatligi va tayyorligi tekshirilmoqda..." "INFO"

while (-not $allHealthy) {
    $elapsed = [int]((Get-Date) - $healthStart).TotalSeconds
    if ($elapsed -ge $maxHealthWait) {
        break
    }

    $db2Status = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" teamflow_db2 2>$null)
    $redisStatus = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" teamflow_redis 2>$null)
    $backendStatus = (& docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" teamflow_backend 2>$null)
    $frontendStatus = (& docker inspect --format="{{.State.Status}}" teamflow_frontend 2>$null)
    $telegramStatus = (& docker inspect --format="{{.State.Status}}" teamflow_telegram 2>$null)

    if ($db2Status -eq "healthy" -and $redisStatus -eq "healthy" -and $backendStatus -eq "healthy" -and $frontendStatus -eq "running") {
        $allHealthy = $true
        Log-Message "Barcha asosiy servislar sog'lom holatga keldi (${elapsed}s)." "INFO"
        break
    }

    Log-Message "Holat tekshiruvi: Db2=[$db2Status], Redis=[$redisStatus], Backend=[$backendStatus], Frontend=[$frontendStatus], Telegram=[$telegramStatus]" "INFO"
    Start-Sleep -Seconds 6
}

# ==============================================================================
# 6. HTTP ENDPOINTLARI VA PORTLARNI TEKSHIRISH
# ==============================================================================
$apiReady = $false
$frontendReady = $false

try {
    $apiResp = Invoke-RestMethod -Uri "http://localhost:8010/api/health/" -Method Get -TimeoutSec 5 -ErrorAction Stop
    if ($apiResp.status -eq "ok") {
        $apiReady = $true
    }
} catch {}

try {
    $feResp = Invoke-WebRequest -Uri "http://localhost:5183" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($feResp.StatusCode -eq 200) {
        $frontendReady = $true
    }
} catch {}

# ==============================================================================
# 7. NATIJANI QAYD ETISH VA BILDIRISHNOMA CHIQARISH
# ==============================================================================
$runningContainers = & docker ps --filter "name=teamflow" --format "  - {{.Names}}: {{.Status}}"

if ($apiReady -and $frontendReady) {
    Log-Message "=== TeamFlow loyihasi muvaffaqiyatli ishga tushirildi ===" "INFO"
    Log-Message "Ishlayotgan konteynerlar:`n$runningContainers" "INFO"
    Log-Message "Frontend: http://localhost:5183 | Backend API: http://localhost:8010/api/" "INFO"
    Show-Notification "TeamFlow Tayyor!" "Tizim muvaffaqiyatli ishga tushirildi.`nFrontend: http://localhost:5183" "Info"
} elseif ($allHealthy) {
    Log-Message "=== TeamFlow konteynerlari ko'tarildi, tarmoq ulanishlari faol ===" "INFO"
    Log-Message "Ishlayotgan konteynerlar:`n$runningContainers" "INFO"
    Show-Notification "TeamFlow Ishga Tushdi" "Konteynerlar faol.`nFrontend: http://localhost:5183" "Info"
} else {
    Log-Message "OGOHLANTIRISH: Ayrim servislar belgilangan vaqt ichida to'liq sog'lom holatga kelmadi." "WARN"
    Log-Message "Joriy konteynerlar holati:`n$runningContainers" "WARN"
    Show-Notification "TeamFlow Ogohlantirish" "Ayrim servislar kechikmoqda. autostart.log ni tekshiring." "Warning"
}
