from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="n8n Version Manager API")

# CORS middleware - allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js frontend container
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status":"ok"}

from versions import router as versions_router
from snapshots import router as snapshots_router
from infrastructure import router as infrastructure_router
from available_versions import router as available_versions_router
from cluster import router as cluster_router

app.include_router(versions_router)
app.include_router(snapshots_router)
app.include_router(infrastructure_router)
app.include_router(available_versions_router)
app.include_router(cluster_router)
