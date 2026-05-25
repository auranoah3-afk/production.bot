$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$starter = Join-Path $PSScriptRoot 'start-discordbot.ps1'
$taskName = 'DiscordBot-PM2-Startup'
$taskUser = "$env:USERDOMAIN\$env:USERNAME"
$runKeyName = 'DiscordBotPM2Startup'
$runKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

$argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$starter`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Starts the Discord bot through PM2 when $taskUser logs in. Repo: $repo" `
    -Force | Out-Null

  Write-Output "Registered scheduled task $taskName for $taskUser."
  Write-Output "Startup command: powershell.exe $argument"
} catch {
  Write-Warning "Scheduled task registration failed: $($_.Exception.Message)"
  New-Item -Path $runKeyPath -Force | Out-Null
  New-ItemProperty `
    -Path $runKeyPath `
    -Name $runKeyName `
    -Value "powershell.exe $argument" `
    -PropertyType String `
    -Force | Out-Null

  Write-Output "Registered user startup entry $runKeyName for $taskUser."
  Write-Output "Startup command: powershell.exe $argument"
}
