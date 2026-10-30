# ===================================================================
# POS System — Launcher otomatis (Windows / PowerShell)
# -------------------------------------------------------------------
# Menjalankan server Next.js (`npm run dev`) dan otomatis restart bila
# proses berhenti tak terduga (crash). Semua output dicatat ke
# <project>/logs/pos.log agar mudah diperiksa.
#
# Biasanya script ini TIDAK perlu dijalankan manual — dipanggil oleh
# Scheduled Task "POS-System-AutoStart" (lihat setup-autostart.ps1).
# Jika ingin jalankan manual:
#   powershell -ExecutionPolicy Bypass -File scripts\start-pos.ps1
# ===================================================================

$ErrorActionPreference = "Continue"

# Akar project = induk dari folder scripts/
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
$LogFile = Join-Path $LogDir "pos.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line
}

# Tunggu MongoDB siap (port 27017) agar frontend/backend langsung
# terhubung ke database saat aplikasi mulai.
function Wait-ForMongo {
    param([int]$TimeoutSeconds = 60)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", 27017)
            if ($tcp.Connected) { $tcp.Close(); return $true }
        } catch {
            Start-Sleep -Seconds 2
            $elapsed += 2
        }
    }
    return $false
}

Write-Log "===== POS launcher dimulai ====="
Write-Log "Project root : $ProjectRoot"
Write-Log "Log file     : $LogFile"

$mongo = Wait-ForMongo -TimeoutSeconds 60
if ($mongo) {
    Write-Log "MongoDB siap di 127.0.0.1:27017."
} else {
    Write-Log "PERINGATAN: MongoDB belum terdeteksi setelah 60 d. Server tetap start; Mongoose akan retry otomatis."
}

# Loop restart — bila `npm run dev` berhenti (crash / port dipakai),
# tunggu 5 detik lalu jalankan ulang.
$iteration = 0
while ($true) {
    $iteration++
    $start = Get-Date
    Write-Log "[$iteration] Menjalankan: npm run dev + https-proxy"

    # Generate sertifikat HTTPS (skip bila sudah ada & valid)
    & node scripts/generate-https-cert.mjs 2>&1 | ForEach-Object {
        Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'HH:mm:ss')] [cert] $_"
    }

    # Jalankan HTTPS proxy di background (port 3443 → 3000)
    $proxyJob = Start-Job -ScriptBlock {
        param($root, $logFile)
        Set-Location $root
        & node scripts/https-proxy.mjs 2>&1 | ForEach-Object {
            Add-Content -Path $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] [proxy] $_"
        }
    } -ArgumentList $ProjectRoot, $LogFile

    try {
        # 2>&1 menggabungkan stderr ke stdout lalu dicatat baris demi baris.
        & npm run dev 2>&1 | ForEach-Object {
            Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $_"
        }
    } catch {
        Write-Log "[$iteration] Exception: $($_.Exception.Message)"
    } finally {
        # Matikan proxy job saat dev server berhenti
        Stop-Job -Job $proxyJob -ErrorAction SilentlyContinue
        Remove-Job -Job $proxyJob -ErrorAction SilentlyContinue
    }

    $dur = (Get-Date) - $start
    Write-Log "[$iteration] Proses berhenti setelah $([math]::Round($dur.TotalSeconds)) d. Restart dalam 5 d..."
    Start-Sleep -Seconds 5
}
