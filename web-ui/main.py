from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="n8n Version Manager API")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server (old UI)
        "http://localhost:3000",  # Next.js dev server (new UI)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status":"ok"}

from api.versions import router as versions_router
from api.snapshots import router as snapshots_router
from api.infrastructure import router as infrastructure_router
from api.available_versions import router as available_versions_router
from api.cluster import router as cluster_router

app.include_router(versions_router)
app.include_router(snapshots_router)
app.include_router(infrastructure_router)
app.include_router(available_versions_router)
app.include_router(cluster_router)

from fastapi.staticfiles import StaticFiles
import os

# Serve static files (must be last)
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
