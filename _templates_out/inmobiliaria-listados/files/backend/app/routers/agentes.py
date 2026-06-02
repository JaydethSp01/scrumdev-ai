from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Agente(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: str

agentes_db = [
    Agente(id=1, nombre="Juan Perez", email="juan.perez@example.com", telefono="1234567890"),
    Agente(id=2, nombre="Maria Gomez", email="maria.gomez@example.com", telefono="0987654321"),
]

@router.get("/agentes", response_model=List[Agente])
async def get_agentes():
    return agentes_db

@router.post("/agentes", response_model=Agente)
async def create_agente(agente: Agente):
    agentes_db.append(agente)
    return agente

@router.put("/agentes/{agente_id}", response_model=Agente)
async def update_agente(agente_id: int, agente: Agente):
    for index, a in enumerate(agentes_db):
        if a.id == agente_id:
            agentes_db[index] = agente
            return agente
    raise HTTPException(status_code=404, detail="Agente not found")

@router.delete("/agentes/{agente_id}")
async def delete_agente(agente_id: int):
    for index, a in enumerate(agentes_db):
        if a.id == agente_id:
            del agentes_db[index]
            return {"message": "Agente deleted"}
    raise HTTPException(status_code=404, detail="Agente not found")
