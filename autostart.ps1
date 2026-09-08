# TeamFlow Loyihasini kompyuter yoqilganda avtomatik ishga tushirish skripti
$logPath = "D:\Task\autostart.log"

function Log-Message {
    param([string]$Message)
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timestamp] $Message"
    Add-Content -Path $logPath -Value $logLine -Encoding utf8
}

Log-Message "=== TeamFlow avtomatik ishga tushirish jarayoni boshlandi ==="

# 1. Docker Desktop o'rnatilgan joyini aniqlash va ishga tushirish
$dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Docker xizmati / demoni ishlayaptimi tekshirish
$maxAttempts = 40 # 40 x 5s = 200s
$attempt = 0
$dockerReady = $false

while (-not $dockerReady -and $attempt -lt $maxAttempts) {
    $attempt++
    try {
        $null = & docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerReady = $true
            Log-Message "Docker demoni tayyor va ishlayapti ($attempt-urinish)."
            break
        }
    } catch {
        # kutish
    }

    # Agar Docker Desktop jarayoni yo'q bo'lsa, uni ishga tushiramiz
    $dockerProcess = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $dockerProcess -and (Test-Path $dockerDesktopExe)) {
        Log-Message "Docker Desktop ishga tushirilmoqda: $dockerDesktopExe"
        Start-Process $dockerDesktopExe
    }

    Log-Message "Docker ishga tushishi kutilmoqda... ($attempt/$maxAttempts)"
    Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
    Log-Message "XATOLIK: Docker belgilangan vaqt ichida (200s) ishga tushmadi."
    exit 1
}

# 2. Docker Compose loyihasini ishga tushirish
Log-Message "Docker Compose konteynerlari ishga tushirilmoqda (D:\Task\docker-compose.yml)..."
Set-Location -Path "D:\Task"

try {
    $composeOutput = & docker compose -f "D:\Task\docker-compose.yml" up -d 2>&1
    Log-Message "Docker compose natijasi: $composeOutput"
} catch {
    Log-Message "XATOLIK: Docker compose bajarishda xatolik yuz berdi: $_"
    exit 1
}

# 3. Konteynerlar holatini tekshirish
Start-Sleep -Seconds 3
$runningContainers = & docker ps --filter "name=teamflow" --format "{{.Names}}: {{.Status}}"
Log-Message "Ishlayotgan TeamFlow konteynerlari:`n$runningContainers"
Log-Message "=== TeamFlow loyihasi muvaffaqiyatli ishga tushirildi ==="
