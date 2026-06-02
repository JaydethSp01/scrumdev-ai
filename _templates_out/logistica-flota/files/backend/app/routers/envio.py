from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Envio(BaseModel):
    id: int
    descripcion: str
    destino: str
    conductorId: int
    vehiculoId: int

envios_db = []

@router.get('/envio', response_model=List[Envio])
def get_envios():
    return envios_db

@router.post('/envio', response_model=Envio)
def create_envio(envio: Envio):
    envio.id = len(envios_db) + 1
    envios_db.append(envio)
    return envio
