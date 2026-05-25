$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$env:NODE_ENV = 'production'

npx.cmd pm2 start ecosystem.config.cjs --env production --only discordbot --update-env
npx.cmd pm2 save | Out-Null
