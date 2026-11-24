$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$record = Join-Path $root 'runtime/service.json'
if (!(Test-Path -LiteralPath $record)) { Write-Host 'No tracked Nanhu server.'; exit 0 }
$state = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
if ($state.pid -notmatch '^\d+$' -or $state.started -notmatch '^\d+$' -or
    [IO.Path]::GetFileName($state.executable) -ine 'java.exe') {
    throw 'Invalid service record. No process was stopped.'
}
$proc = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if ($proc -and $proc.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.started -and $proc.Path -eq $state.executable) {
    Stop-Process -Id $state.pid -ErrorAction Stop
    Write-Host "Stopped Nanhu server (PID $($state.pid))."
} else { Write-Host 'Tracked Nanhu server is no longer running.' }
Remove-Item -LiteralPath $record
