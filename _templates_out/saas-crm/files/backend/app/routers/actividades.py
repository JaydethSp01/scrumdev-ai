from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel

router = APIRouter()

class Actividad(BaseModel):
    id: int
    description: str
    date: str

database = [
    Actividad(id=1, description="Reunión con cliente", date="2023-10-01"),
    Actividad(id=2, description="Llamada de seguimiento", date="2023-10-02")
]

@router.get("/actividades", response_model=List[Actividad])
async def get_actividades():
    return database

@router.post("/actividades", response_model=Actividad)
async def create_actividad(actividad: Actividad):
    database.append(actividad)
    return actividad

@router.put("/actividades/{actividad_id}", response_model=Actividad)
async def update_actividad(actividad_id: int, actividad: Actividad):
    for idx, existing_actividad in enumerate(database):
        if existing_actividad.id == actividad_id:
            database[idx] = actividad
            return actividad
    raise HTTPException(status_code=404, detail="Actividad not found")

@router.delete("/actividades/{actividad_id}")
async def delete_actividad(actividad_id: int):
    for idx, existing_actividad in enumerate(database):
        if existing_actividad.id == actividad_id:
            del database[idx]
            return {"message": "Actividad deleted"}
    raise HTTPException(status_code=404, detail="Actividad not found")
