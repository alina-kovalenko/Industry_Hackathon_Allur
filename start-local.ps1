param([int]$Port = 8001)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'frontend/dist/index.html')) {
    throw 'Frontend build is missing. Build frontend first: cd frontend; npm ci; npm run build'
}
$allurVenv = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $allurVenv)) {
    $allurCodexPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if ($env:ALLUR_PYTHON) {
        & $env:ALLUR_PYTHON -m venv .venv
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.12 -m venv .venv
    } elseif (Test-Path -LiteralPath $allurCodexPython) {
        & $allurCodexPython -m venv .venv
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv .venv
    } else { throw 'Python 3.12 is required. Set ALLUR_PYTHON to its executable path.' }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
}
& $allurVenv -c "import importlib.util, sys; sys.exit(not all(importlib.util.find_spec(n) for n in ('fastapi', 'uvicorn', 'pydantic')))"
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath 'wheelhouse') {
        & $allurVenv -m pip install --disable-pip-version-check --no-index --find-links wheelhouse -r requirements-runtime.lock
    } else {
        & $allurVenv -m pip install --disable-pip-version-check -r requirements-runtime.lock
    }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
Write-Host "Open http://127.0.0.1:$Port/app/ . Stop server: Ctrl+C."
# Keep the server in this console so Ctrl+C stops it.
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'
& $allurVenv scripts/serve.py
if ($LASTEXITCODE -ne 0) { throw 'Server did not start. Check whether the port is already in use.' }
