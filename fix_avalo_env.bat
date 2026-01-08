@echo off
title Avalo Environment Auto-Fix

echo =====================================================
echo   AVALO AUTO-FIX START
echo =====================================================

cd /d C:\Users\Drink\avaloapp

echo.
echo === Installing missing typing packages ===
npm install -D @types/react
npm install -D @types/react-dom
npm install -D @types/node
npm install -D @types/express
npm install -D @types/body-parser
npm install -D @types/cors

echo.
echo === Installing runtime packages ===
npm install express cors body-parser

echo.
echo === Installing Firebase client + admin ===
npm install firebase firebase-admin

echo.
echo === Installing SendGrid ===
npm install @sendgrid/mail

echo.
echo === Installing TSX runner ===
npm install -D tsx

echo.
echo === Fixing SDK import resolution ===
npx tsx ./scripts/fix-sdk-imports.ts

echo.
echo === Clearing Expo + Metro cache ===
expo start -c

echo.
echo === Clearing TypeScript cache ===
del /s /q .tsbuildinfo 2>nul

echo.
echo === Clearing npm cache ===
npm cache verify

echo.
echo =====================================================
echo   ? AVALO AUTO-FIX COMPLETE
echo =====================================================

pause
exit
