$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$env:NODE_ENV = 'development'
$env:BOT_ENV = 'development'

npx.cmd pm2 delete discordbot-dev 2>$null
npx.cmd pm2 start ecosystem.config.cjs --env development --only discordbot-dev --update-env
npx.cmd pm2 save | Out-Null
