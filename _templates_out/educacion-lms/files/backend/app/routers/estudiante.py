from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Estudiante(BaseModel):
    id: int
    name: str
    email: str

fake_db = [
    Estudiante(id=1, name="Juan Perez", email="juan.perez@example.com"),
    Estudiante(id=2, name="Maria Lopez", email="maria.lopez@example.com"),
]

@router.get("/estudiante", response_model=List[Estudiante])
async def get_estudiantes():
    return fake_db

@router.get("/estudiante/{estudiante_id}", response_model=Estudiante)
async def get_estudiante(estudiante_id: int):
    estudiante = next((estudiante for estudiante in fake_db if estudiante.id == estudiante_id), None)
    if estudiante is None:
        raise HTTPException(status_code=404, detail="Estudiante not found")
    return estudiante

@router.post("/estudiante", response_model=Estudiante)
async def create_estudiante(estudiante: Estudiante):
    fake_db.append(estudiante)
    return estudiante

@router.put("/estudiante/{estudiante_id}", response_model=Estudiante)
async def update_estudiante(estudiante_id: int, estudiante: Estudiante):
    index = next((i for i, e in enumerate(fake_db) if e.id == estudiante_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Estudiante not found")
    fake_db[index] = estudiante
    return estudiante

@router.delete("/estudiante/{estudiante_id}")
async def delete_estudiante(estudiante_id: int):
    global fake_db
    fake_db = [estudiante for estudiante in fake_db if estudiante.id != estudiante_id]
    return {"detail": "Estudiante deleted"}