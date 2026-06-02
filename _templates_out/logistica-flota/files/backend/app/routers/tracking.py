from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Tracking(BaseModel):
    id: int
    envioId: int
    estado: str
    ubicacion: str

trackings_db = []

@router.get('/tracking', response_model=List[Tracking])
def get_trackings():
    return trackings_db

@router.post('/tracking', response_model=Tracking)
def create_tracking(tracking: Tracking):
    tracking.id = len(trackings_db) + 1
    trackings_db.append(tracking)
    return tracking
