param([Parameter(Mandatory=$true)][string]$Installer, [switch]$CheckUninstall)
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$repository = Split-Path $PSScriptRoot -Parent
$runDirectory = Join-Path $repository ('test-results\install-check-' + [guid]::NewGuid().ToString('N'))
$destination = Join-Path $runDirectory 'DriftFetch'
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$report = @{ installer=$installerPath; sha256=(Get-FileHash -LiteralPath $installerPath).Hash; destination=$destination; success=$false; checks=@(); uninstallRequested=[bool]$CheckUninstall }
try {
    # NSIS allows one installer at a time. Never mistake its early exit for installation.
    $existing = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installerPath }
    if ($existing) { throw 'This installer is already running. Close that installer before testing another instance.' }
    $process = Start-Process -FilePath $installerPath -ArgumentList @('/S', '/currentuser', '/no-desktop-shortcut', ('/D='+$destination)) -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(120000)) { throw "Installer timed out (PID $($process.Id))." }
    $report.exitCode = $process.ExitCode
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
    foreach ($relative in @('DriftFetch.exe','Uninstall DriftFetch.exe','resources\app.asar','resources\engines\yt-dlp.exe','resources\engines\ffmpeg.exe','resources\engines\ffprobe.exe','resources\engines\deno.exe','resources\engines\gallery-dl.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $destination $relative) -PathType Leaf)) { throw "Installer reported success but did not create $relative." }
    }
    $report.checks += 'Installer created all required application and engine files.'
    & node (Join-Path $PSScriptRoot 'installed-engines-smoke.mjs') $destination
    if ($LASTEXITCODE -ne 0) { throw 'Installed-engine smoke test failed.' }
    $report.checks += 'Bundled engines executed and downloaded/merged synthetic media without development tools on PATH.'
    if ($CheckUninstall) {
        $resolvedDestination = (Resolve-Path -LiteralPath $destination).Path
        $allowedRoot = (Resolve-Path -LiteralPath (Join-Path $repository 'test-results')).Path + '\'
        if (-not $resolvedDestination.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to uninstall outside the test-results directory.' }
        $uninstall = Start-Process -FilePath (Join-Path $resolvedDestination 'Uninstall DriftFetch.exe') -ArgumentList @('/S', '/currentuser', ('/D='+$resolvedDestination)) -PassThru -WindowStyle Hidden
        if (-not $uninstall.WaitForExit(60000)) { throw "Uninstaller timed out (PID $($uninstall.Id))." }
        $report.uninstallExitCode = $uninstall.ExitCode
        if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstall.ExitCode)." }
        # NSIS can hand off to a temporary child; its parent's zero exit is not proof of removal.
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        do {
            $remaining = @('DriftFetch.exe','resources\app.asar','resources\engines\yt-dlp.exe') | Where-Object { Test-Path -LiteralPath (Join-Path $resolvedDestination $_) }
            if (-not $remaining) { break }
            Start-Sleep -Milliseconds 250
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($remaining) { throw ('Uninstaller reported success but left installed files: ' + ($remaining -join ', ')) }
        $report.checks += 'Uninstaller removed application and engine files.'
    }
    $report.success = $true
} catch {
    $report.error = $_.Exception.Message
} finally {
    $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runDirectory 'report.json')
    $report | ConvertTo-Json | Write-Output
}
if (-not $report.success) { exit 1 }
