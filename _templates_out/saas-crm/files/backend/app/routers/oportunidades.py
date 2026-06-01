from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel

router = APIRouter()

class Oportunidad(BaseModel):
    id: int
    description: str
    stage: str

database = [
    Oportunidad(id=1, description="Oportunidad A", stage="Inicial"),
    Oportunidad(id=2, description="Oportunidad B", stage="Negociación")
]

@router.get("/oportunidades", response_model=List[Oportunidad])
async def get_oportunidades():
    return database

@router.post("/oportunidades", response_model=Oportunidad)
async def create_oportunidad(oportunidad: Oportunidad):
    database.append(oportunidad)
    return oportunidad

@router.put("/oportunidades/{oportunidad_id}", response_model=Oportunidad)
async def update_oportunidad(oportunidad_id: int, oportunidad: Oportunidad):
    for idx, existing_oportunidad in enumerate(database):
        if existing_oportunidad.id == oportunidad_id:
            database[idx] = oportunidad
            return oportunidad
    raise HTTPException(status_code=404, detail="Oportunidad not found")

@router.delete("/oportunidades/{oportunidad_id}")
async def delete_oportunidad(oportunidad_id: int):
    for idx, existing_oportunidad in enumerate(database):
        if existing_oportunidad.id == oportunidad_id:
            del database[idx]
            return {"message": "Oportunidad deleted"}
    raise HTTPException(status_code=404, detail="Oportunidad not found")
