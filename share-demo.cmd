@echo off
if not exist "%~dp0tools\cloudflared.exe" (
  echo Missing tools\cloudflared.exe. Use the delivery ZIP or install cloudflared.
  pause
  exit /b 1
)
echo Start start-local.cmd first. Open the generated HTTPS URL with /app/ appended.
echo The public URL works while both windows remain open. Stop with Ctrl+C.
"%~dp0tools\cloudflared.exe" tunnel --url http://127.0.0.1:8001 --protocol http2 --no-autoupdate
