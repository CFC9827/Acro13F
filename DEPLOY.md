# Abrams13F Deployment Guide

This guide covers the steps required to deploy Abrams13F to a cloud environment (Render + Vercel + Supabase).

## Prerequisites

1.  **Supabase Account**: A Postgres database is required.
2.  **Render Account**: For hosting the Backend API and Background Worker.
3.  **Vercel Account**: For hosting the Frontend UI.
4.  **SEC User Agent**: You must have a valid User-Agent string (e.g., `Name (email)`) for SEC EDGAR access.

---

## 1. Database Setup (Supabase)

1.  Create a new project in Supabase.
2.  Go to **Project Settings > Database** and copy the **Connection String** (URI).
    - It should look like: `postgresql://postgres.[ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
3.  Ensure you have the Supabase URL and Anon Key from **Project Settings > API**.

---

## 2. Backend Deployment (Render)

### A. Deploying the API
1.  Create a new **Web Service** on Render.
2.  Connect your GitHub repository.
3.  Settings:
    - **Environment**: `Docker`
    - **Plan**: `Starter` (or higher)
4.  **Environment Variables**:
    - `ENV`: `production`
    - `DATABASE_URL`: Your Supabase connection string.
    - `SUPABASE_URL`: Your Supabase project URL.
    - `SUPABASE_KEY`: Your Supabase service role key (or anon key depending on your RLS).
    - `SEC_USER_AGENT`: Your declared SEC User-Agent.
    - `FRONTEND_URL`: The URL of your Vercel deployment (you can update this later).
5.  Deploy the service.

### B. Deploying the Background Worker
1.  Create a new **Background Worker** on Render.
2.  Connect the same GitHub repository.
3.  Settings:
    - **Environment**: `Docker`
    - **Docker Command Override**: `python -m backend.worker`
4.  **Environment Variables**: Use the same variables as the API service.

---

## 3. Frontend Deployment (Vercel)

1.  Create a new project in Vercel.
2.  Connect your GitHub repository.
3.  **Framework Preset**: `Vite`
4.  **Root Directory**: `ui`
5.  **Environment Variables**:
    - `VITE_API_URL`: The URL of your Render API service (e.g., `https://abrams13f-api.onrender.com`).
    - `VITE_SUPABASE_URL`: Your Supabase project URL.
    - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key.
6.  Deploy.

---

## 4. Final Configuration

1.  Once the Vercel app is deployed, copy its URL.
2.  Go back to your **Render API Service** and update the `FRONTEND_URL` environment variable with the Vercel URL.
3.  This ensures that CORS is correctly locked down to your specific frontend.

---

## Local Production Testing
You can test the production setup locally using Docker Compose:
```bash
# Set your environment variables first
docker-compose up --build
```
