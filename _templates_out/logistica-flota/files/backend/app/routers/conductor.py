from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Conductor(BaseModel):
    id: int
    nombre: str
    licencia: str

conductores_db = []

@router.get('/conductor', response_model=List[Conductor])
def get_conductores():
    return conductores_db

@router.post('/conductor', response_model=Conductor)
def create_conductor(conductor: Conductor):
    conductor.id = len(conductores_db) + 1
    conductores_db.append(conductor)
    return conductor
