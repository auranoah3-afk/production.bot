$taskName = "DiscordBotPM2"
$script = "pm2 resurrect"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command \"$script\""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel LeastPrivilege

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Description "Resurrect PM2-managed Discord bot at user login." -Force

Write-Host "Scheduled task '$taskName' created. The bot will resurrect on your next login." -ForegroundColor Green
