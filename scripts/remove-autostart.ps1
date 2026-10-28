# ===================================================================
# POS System — Hapus auto-start (Windows Scheduled Task)
# -------------------------------------------------------------------
# Menghapus tugas terjadwal "POS-System-AutoStart" dan menghentikan
# server yang masih berjalan untuk project ini.
#
# Jalankan:
#   powershell -ExecutionPolicy Bypass -File scripts\remove-autostart.ps1
# ===================================================================

$TaskName = "POS-System-AutoStart"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# 1. Hentikan & hapus tugas terjadwal.
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
    # abaikan bila task sedang tidak berjalan / tidak ada
}

try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Host "Tugas terjadwal '$TaskName' dihapus. Auto-start dinonaktifkan."
} catch {
    Write-Host "Tugas '$TaskName' tidak ditemukan / sudah dihapus."
}

# 2. Hentikan proses node yang terkait project ini (jangan bunuh node lain).
Write-Host "Menghentikan server project ini (bila masih berjalan)..."
try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$ProjectRoot*" } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "  node PID $($_.ProcessId) dihentikan."
        }
} catch {
    Write-Host "  (tidak ada proses node project yang perlu dihentikan)"
}

Write-Host ""
Write-Host "Selesai. Untuk mengaktifkan lagi nanti: scripts\setup-autostart.ps1"
