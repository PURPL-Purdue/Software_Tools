#!/bin/bash

echo "Stopping old instances..."

pm2 delete backend 2>/dev/null
pm2 delete frontend 2>/dev/null

echo "Starting backend..."

cd backend || exit
pm2 start "venv/bin/uvicorn main:app" --name backend

echo "Starting frontend..."

cd ../frontend || exit
pm2 start "npm run dev -- --host 0.0.0.0" --name frontend

echo "Applications started."

pm2 list