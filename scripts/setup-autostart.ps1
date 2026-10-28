# ===================================================================
# POS System — Daftarkan auto-start (Windows Scheduled Task)
# -------------------------------------------------------------------
# Membuat tugas terjadwal "POS-System-AutoStart" yang menjalankan
# scripts/start-pos.ps1 (tersembunyi) setiap kali user LOG ON.
# Dengan begitu aplikasi + database tetap berjalan tanpa harus
# mengetik `npm run dev` secara manual setiap menyalakan laptop.
#
# Jalankan sekali (tidak butuh admin):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
# ===================================================================

$TaskName = "POS-System-AutoStart"
$Launcher = Join-Path $PSScriptRoot "start-pos.ps1"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $Launcher)) {
    Write-Error "Launcher tidak ditemukan: $Launcher"
    exit 1
}

# ── Cek service MongoDB (sumber kebingungan paling umum) ──
$mongo = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
if ($mongo) {
    Write-Host "MongoDB service : Status=$($mongo.Status), StartType=$($mongo.StartType)"
    if ($mongo.StartType -ne "Automatic") {
        Write-Warning "MongoDB belum 'Automatic'. Agar DB otomatis nyala saat boot, jalankan sebagai admin:"
        Write-Warning "    Set-Service -Name MongoDB -StartupType Automatic"
    }
    if ($mongo.Status -ne "Running") {
        Write-Warning "MongoDB sedang tidak berjalan. Start manual (admin): Start-Service -Name MongoDB"
    }
} else {
    Write-Warning "Service 'MongoDB' tidak ditemukan. Pastikan MongoDB terinstall & jalan sebelum aplikasi start."
}
Write-Host ""

# ── Definisi tugas terjadwal ──
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`"" `
    -WorkingDirectory $ProjectRoot

# Trigger: saat user ini log on.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Jalankan di sesi user (Interactive), tanpa admin (Limited).
$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# Tidak ada batas waktu (server berjalan terus); tetap jalan saat baterai.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Menjalankan POS System (Next.js) otomatis saat logon." `
    -Force | Out-Null

Write-Host "Berhasil! Tugas terjadwal '$TaskName' dibuat."
Write-Host "Aplikasi akan mulai otomatis saat Anda log on."
Write-Host ""
Write-Host "Mulai sekarang (tanpa logon ulang):"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Cek status / hentikan via Task Scheduler, atau jalankan:"
Write-Host "    scripts\remove-autostart.ps1"
Write-Host "Log aplikasi : $ProjectRoot\logs\pos.log"
