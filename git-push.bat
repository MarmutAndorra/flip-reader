@echo off
cd /d "F:\Cursor App Project\flip-reader"
git config user.email "dennymaulanda4@gmail.com"
git config user.name "Denny"
del /f .git\index.lock 2>nul
git add -A
git commit -m "fix: Google OAuth - switch to implicit flow, fix redirect URL"
git push
echo.
echo Done! Press any key to close.
pause
