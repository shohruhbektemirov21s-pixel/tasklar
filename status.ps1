# TeamFlow — Tizim Holati va Diagnostika skripti
# Joylashuvi: D:\Task\status.ps1

Write-Host '==============================================================================' -ForegroundColor Cyan
Write-Host '      TEAMFLOW — TIZIM HOLATI VA DIAGNOSTIKA' -ForegroundColor Cyan
Write-Host '==============================================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Konteynerlar ro'yxati
Write-Host '[1/4] DOCKER VA KONTEYNERLARNING ASOSIY HOLATI:' -ForegroundColor Yellow
$containers = docker ps -a --filter "name=teamflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
foreach ($line in $containers) {
    Write-Host ("  " + $line)
}
Write-Host ''

# 2. Servislar salomatligi (Health)
Write-Host '[2/4] SALOMATLIK TEKSHIRUVI (HEALTHCHECKS):' -ForegroundColor Yellow
$serviceList = @('teamflow_db2', 'teamflow_redis', 'teamflow_backend', 'teamflow_frontend', 'teamflow_telegram')
$formatStr = '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'

foreach ($svc in $serviceList) {
    $h = (& docker inspect --format $formatStr $svc 2>$null)
    if (-not $h) { $h = 'topilmadi' }
    $svcPadded = $svc.PadRight(20)
    Write-Host ('  - ' + $svcPadded + ' : ') -NoNewline
    if ($h -eq 'healthy' -or $h -eq 'running') {
        Write-Host ('[' + $h + ']') -ForegroundColor Green
    } else {
        Write-Host ('[' + $h + ']') -ForegroundColor Red
    }
}
Write-Host ''

# 3. Tarmoq portlari va API javobi
Write-Host '[3/4] TARMOQ PORTLARI VA API JAVOBI:' -ForegroundColor Yellow

# Backend API
try {
    $api = Invoke-RestMethod -Uri 'http://localhost:8010/api/health/' -TimeoutSec 3 -ErrorAction Stop
    $apiStatus = $api.status
    Write-Host '  - Backend API (8010)       : ' -NoNewline
    Write-Host ('[OK] status = ' + $apiStatus) -ForegroundColor Green
} catch {
    Write-Host '  - Backend API (8010)       : ' -NoNewline
    Write-Host '[FAIL] Ulanib bolmadi' -ForegroundColor Red
}

# Frontend UI
try {
    $fe = Invoke-WebRequest -Uri 'http://localhost:5183' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    $feCode = $fe.StatusCode
    Write-Host '  - Frontend UI (5183)       : ' -NoNewline
    Write-Host ('[OK] HTTP ' + $feCode) -ForegroundColor Green
} catch {
    Write-Host '  - Frontend UI (5183)       : ' -NoNewline
    Write-Host '[FAIL] Ulanib bolmadi' -ForegroundColor Red
}
Write-Host ''

# 4. Asosiy modullar va havolalar
Write-Host '[4/4] TIZIM HAVOLALARI:' -ForegroundColor Yellow
Write-Host '  - Bosh sahifa (Frontend)   : http://localhost:5183/' -ForegroundColor Gray
Write-Host '  - Buyurtmalar moduli       : http://localhost:5183/buyurtmalar' -ForegroundColor Gray
Write-Host '  - Loyihalar moduli         : http://localhost:5183/loyihalar' -ForegroundColor Gray
Write-Host '  - Vazifalar moduli         : http://localhost:5183/vazifalar' -ForegroundColor Gray
Write-Host '  - Takliflar moduli         : http://localhost:5183/takliflar' -ForegroundColor Gray
Write-Host '  - Django REST API          : http://localhost:8010/api/' -ForegroundColor Gray
Write-Host '  - Django Boshqaruvi        : http://localhost:8010/admin/' -ForegroundColor Gray
Write-Host '  - IBM Db2 Bazasi           : localhost:50000 (Database: TEAMFLOW)' -ForegroundColor Gray
Write-Host '  - Redis Kesh               : localhost:6379' -ForegroundColor Gray
Write-Host ''
Write-Host '==============================================================================' -ForegroundColor Cyan
