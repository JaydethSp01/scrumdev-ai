from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Ruta(BaseModel):
    id: int
    nombre: str
    origen: str
    destino: str

rutas_db = []

@router.get('/ruta', response_model=List[Ruta])
def get_rutas():
    return rutas_db

@router.post('/ruta', response_model=Ruta)
def create_ruta(ruta: Ruta):
    ruta.id = len(rutas_db) + 1
    rutas_db.append(ruta)
    return ruta
