@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  exit /b 1
)
if not exist "%~dp0config.json" (
  echo Missing config.json. Copy config.example.json to config.json and run setup instructions in README.md.
  exit /b 1
)
node "%~dp0server.cjs"
