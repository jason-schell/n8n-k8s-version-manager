from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="n8n Version Manager API")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
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

app.include_router(versions_router)
app.include_router(snapshots_router)
app.include_router(infrastructure_router)

from fastapi.staticfiles import StaticFiles
import os

# Serve static files (must be last)
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
