from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Vehiculo(BaseModel):
    id: int
    marca: str
    modelo: str
    matricula: str

vehiculos_db = []

@router.get('/vehiculo', response_model=List[Vehiculo])
def get_vehiculos():
    return vehiculos_db

@router.post('/vehiculo', response_model=Vehiculo)
def create_vehiculo(vehiculo: Vehiculo):
    vehiculo.id = len(vehiculos_db) + 1
    vehiculos_db.append(vehiculo)
    return vehiculo
