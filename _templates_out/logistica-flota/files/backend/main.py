from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Include routers
# from app.routers import vehiculo, conductor, ruta, envio, tracking
# app.include_router(vehiculo.router)
# app.include_router(conductor.router)
# app.include_router(ruta.router)
# app.include_router(envio.router)
# app.include_router(tracking.router)