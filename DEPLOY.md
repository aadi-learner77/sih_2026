# SkyGuard AI - Deployment Guide

This guide walks you through deploying the SkyGuard AI Dashboard for live demo access. The stack consists of:
- **Backend:** FastAPI (Python) → Deploy to Render.com (free tier)
- **Frontend:** React + Vite (TypeScript) → Deploy to Vercel (free tier)

---

## Prerequisites

1. **GitHub Account** - Your code should be pushed to a GitHub repository
2. **Render.com Account** - Sign up at https://render.com (free tier available)
3. **Vercel Account** - Sign up at https://vercel.com (free tier available)
4. **Anthropic API Key** - Get one from https://console.anthropic.com/ (for LLM explanations)

---

## Part 1: Deploy Backend to Render.com

### Step 1: Push Code to GitHub

Ensure your latest code (including `backend/render.yaml`) is pushed to GitHub:

```bash
git add .
git commit -m "Add deployment configs and LLM explanations"
git push origin main
```

### Step 2: Create New Web Service on Render

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account if not already connected
4. Select your **SkyGuard AI Dashboard** repository
5. Configure the service:

   | Field | Value |
   |-------|-------|
   | **Name** | `skyguard-backend` (or any name you prefer) |
   | **Region** | Choose closest to your location |
   | **Branch** | `main` |
   | **Root Directory** | `backend` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

6. Click **"Advanced"** and add Environment Variables:
   - Key: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key from https://console.anthropic.com/

7. Select **"Free"** instance type
8. Click **"Create Web Service"**

### Step 3: Wait for Deployment

- Render will build and deploy your backend (takes ~2-5 minutes)
- Once deployed, you'll see a URL like: `https://skyguard-backend.onrender.com`
- **Copy this URL** - you'll need it for the frontend deployment

### Step 4: Test the Backend

Visit your backend URL in a browser and append `/health`:
```
https://skyguard-backend.onrender.com/health
```

You should see:
```json
{"status": "ok", "message": "SkyGuard AI Backend is running"}
```

Also test the stations endpoint:
```
https://skyguard-backend.onrender.com/stations
```

You should see a JSON array of 15 Indian AWS stations.

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select your **SkyGuard AI Dashboard** repository
4. Configure the project:

   | Field | Value |
   |-------|-------|
   | **Project Name** | `skyguard-dashboard` (or any name) |
   | **Framework Preset** | `Vite` (should auto-detect) |
   | **Root Directory** | `.` (leave as root) |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

5. Click **"Environment Variables"** and add:
   - Key: `VITE_API_BASE_URL`
   - Value: Your Render backend URL (e.g., `https://skyguard-backend.onrender.com`)
   - **Important:** No trailing slash!

6. Click **"Deploy"**

### Step 2: Wait for Deployment

- Vercel will build and deploy your frontend (~1-3 minutes)
- Once deployed, you'll get a URL like: `https://skyguard-dashboard.vercel.app`

### Step 3: Test the Full Stack

1. Visit your Vercel frontend URL: `https://skyguard-dashboard.vercel.app`
2. You should see the SkyGuard AI Dashboard loading with:
   - Live India map with 15 station pins
   - Real-time telemetry gauges
   - Event log (initially empty until anomalies are detected)
   - Detection mode toggle (Rule-Based / AI-Enhanced)

3. **Test Fault Injection:**
   - Click the red **"SIMULATE FAULT"** button in the bottom-right
   - Select a station (e.g., AWS-DEL-01)
   - Select a fault type (e.g., "spike")
   - Click **"INJECT NOW"**
   - Within 1-2 seconds, you should see:
     - The station pin turns red on the map
     - A new event appears in the Event Log with an LLM-generated explanation
     - The gauges show anomalous values
     - Network health drops

---

## Part 3: Verify LLM Explanations Are Working

1. Inject a fault (as described above)
2. In the **Event Log** panel, check if the anomaly event shows:
   - A 💡 icon followed by a natural-language explanation
   - Example: *"Temperature spike of 52.3°C detected at AWS-DEL-01, significantly above the expected 34°C for this hour, triggering AI model alert."*

3. If you see only the fallback explanation (e.g., "Spike detected on temperature at AWS-DEL-01 via AI model (confidence 97%)."), it means:
   - The `ANTHROPIC_API_KEY` environment variable is not set correctly on Render
   - Go back to Render dashboard → Your service → Environment → Edit `ANTHROPIC_API_KEY` and redeploy

---

## Troubleshooting

### Issue: Frontend shows "Failed to fetch station list"

**Solution:**
- Check that `VITE_API_BASE_URL` is set correctly on Vercel (no trailing slash)
- Check that your Render backend is running (visit the `/health` endpoint)
- Check CORS is enabled in `backend/app/main.py` (should be by default with `allow_origins=["*"]`)
- Redeploy frontend after fixing env vars: Vercel Dashboard → Your Project → Settings → Environment Variables → Edit → Redeploy

### Issue: Backend shows "Application failed to respond" on Render

**Solution:**
- Check Render logs: Dashboard → Your Service → Logs
- Common causes:
  - Missing dependencies in `requirements.txt`
  - Incorrect start command (should be `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
  - Python version mismatch (use Python 3.11 or 3.12)

### Issue: No LLM explanations, only fallback text

**Solution:**
- Verify `ANTHROPIC_API_KEY` is set on Render (Dashboard → Service → Environment)
- Check Render logs for errors like "API Error: 401" (invalid key) or "API Error: 402" (no credits)
- Get a new API key from https://console.anthropic.com/ if needed
- After updating the key, click **"Manual Deploy"** → **"Clear build cache & deploy"**

### Issue: Render free tier is too slow / times out

**Solution:**
- Render's free tier spins down after 15 minutes of inactivity and takes ~30s to wake up
- For a live demo, keep the backend "warm" by visiting `/health` every 5-10 minutes before the demo
- Or upgrade to Render's paid tier ($7/month) for always-on service
- **Alternative for hackathon demos:** Run backend locally (see below)

---

## Fallback: Run Locally for Demo

If cloud deployment is too slow or problematic for your demo, running locally is **completely acceptable** for a hackathon presentation. Judges don't expect production cloud hosting.

### Running Backend Locally

```bash
cd backend
pip install -r requirements.txt
# Set your API key (Windows)
set ANTHROPIC_API_KEY=your_key_here
# Or on Mac/Linux:
# export ANTHROPIC_API_KEY=your_key_here

uvicorn app.main:app --reload
```

Backend will run on `http://localhost:8000`

### Running Frontend Locally

In a new terminal:

```bash
cd "D:\sih 2026\SkyGuard AI Dashboard"
npm install
npm run dev
```

Frontend will run on `http://localhost:8443` (or the port shown in terminal)

### Present from Your Laptop

1. Open `http://localhost:8443` in your browser
2. Project the browser window during your demo
3. Demonstrate fault injection and detection live
4. This is a **normal and acceptable** approach for hackathon demos

---

## Cost Summary

| Service | Free Tier Limits | Sufficient for Demo? |
|---------|-----------------|---------------------|
| **Render.com** | 750 hours/month, sleeps after 15min idle | ✅ Yes, but may be slow to wake |
| **Vercel** | 100GB bandwidth, unlimited projects | ✅ Yes, always fast |
| **Anthropic API** | Free trial credits, then ~$0.003/explanation | ✅ Yes, hundreds of tests for free |

**Total monthly cost if staying on free tiers:** $0

---

## Post-Hackathon: Restricting CORS

After the hackathon, you should restrict CORS to only your frontend domain for security:

**In `backend/app/main.py`:**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://skyguard-dashboard.vercel.app"],  # Your actual frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then redeploy the backend.

---

## Support & Contact

- **Backend Logs:** Render Dashboard → Your Service → Logs
- **Frontend Logs:** Browser DevTools → Console
- **API Docs:** Visit `https://your-backend-url.onrender.com/docs` for interactive FastAPI docs

---

**Last Updated:** 2026-09-04  
**SkyGuard AI Team**
