from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Leccion(BaseModel):
    id: int
    title: str
    content: str

fake_db = [
    Leccion(id=1, title="Introducción a Python", content="Contenido de la lección"),
    Leccion(id=2, title="Variables y Tipos de Datos", content="Contenido de la lección"),
]

@router.get("/leccion", response_model=List[Leccion])
async def get_lecciones():
    return fake_db

@router.get("/leccion/{leccion_id}", response_model=Leccion)
async def get_leccion(leccion_id: int):
    leccion = next((leccion for leccion in fake_db if leccion.id == leccion_id), None)
    if leccion is None:
        raise HTTPException(status_code=404, detail="Leccion not found")
    return leccion

@router.post("/leccion", response_model=Leccion)
async def create_leccion(leccion: Leccion):
    fake_db.append(leccion)
    return leccion

@router.put("/leccion/{leccion_id}", response_model=Leccion)
async def update_leccion(leccion_id: int, leccion: Leccion):
    index = next((i for i, l in enumerate(fake_db) if l.id == leccion_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Leccion not found")
    fake_db[index] = leccion
    return leccion

@router.delete("/leccion/{leccion_id}")
async def delete_leccion(leccion_id: int):
    global fake_db
    fake_db = [leccion for leccion in fake_db if leccion.id != leccion_id]
    return {"detail": "Leccion deleted"}