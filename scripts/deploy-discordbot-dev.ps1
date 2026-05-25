$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$env:NODE_ENV = 'development'
$env:BOT_ENV = 'development'
$env:COMMAND_DEPLOY_MODE = 'guild'

node src/deploy-commands.js
