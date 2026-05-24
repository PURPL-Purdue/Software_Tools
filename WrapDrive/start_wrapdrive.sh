#!/bin/bash

echo "Starting backend..."

cd backend || exit
pm2 start "venv/bin/uvicorn main:app --reload" --name backend

echo "Starting frontend..."

cd ../frontend || exit
pm2 start "npm run dev -- --host 0.0.0.0" --name frontend

echo "Applications started."

pm2 list