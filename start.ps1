$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js was not found in PATH.' }
$configPath = Join-Path $PSScriptRoot 'config.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Missing config.json. Copy config.example.json to config.json and run setup instructions in README.md.' }
$bridgeConfig = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'config.json') | ConvertFrom-Json
if ($bridgeConfig.codexHome) { $env:CODEX_HOME = $bridgeConfig.codexHome }
& $node.Source (Join-Path $PSScriptRoot 'server.cjs')
exit $LASTEXITCODE
