from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Visita(BaseModel):
    id: int
    propiedad: str
    cliente: str
    fecha: str

visitas_db = [
    Visita(id=1, propiedad="Casa en la playa", cliente="Carlos Ruiz", fecha="2023-10-01"),
    Visita(id=2, propiedad="Apartamento en la ciudad", cliente="Ana Lopez", fecha="2023-10-05"),
]

@router.get("/visitas", response_model=List[Visita])
async def get_visitas():
    return visitas_db

@router.post("/visitas", response_model=Visita)
async def create_visita(visita: Visita):
    visitas_db.append(visita)
    return visita

@router.put("/visitas/{visita_id}", response_model=Visita)
async def update_visita(visita_id: int, visita: Visita):
    for index, v in enumerate(visitas_db):
        if v.id == visita_id:
            visitas_db[index] = visita
            return visita
    raise HTTPException(status_code=404, detail="Visita not found")

@router.delete("/visitas/{visita_id}")
async def delete_visita(visita_id: int):
    for index, v in enumerate(visitas_db):
        if v.id == visita_id:
            del visitas_db[index]
            return {"message": "Visita deleted"}
    raise HTTPException(status_code=404, detail="Visita not found")
