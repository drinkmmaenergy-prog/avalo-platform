@echo off
cd /d C:\a\avalo
echo === G6a Git Push ===
git push origin stabilization/build-green-2026-04-15
echo Push exit: %ERRORLEVEL%
pause
