from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Progreso(BaseModel):
    id: int
    cursoId: int
    estudianteId: int
    porcentaje: float

fake_db = [
    Progreso(id=1, cursoId=1, estudianteId=1, porcentaje=50.0),
    Progreso(id=2, cursoId=2, estudianteId=2, porcentaje=75.0),
]

@router.get("/progreso", response_model=List[Progreso])
async def get_progresos():
    return fake_db

@router.get("/progreso/{progreso_id}", response_model=Progreso)
async def get_progreso(progreso_id: int):
    progreso = next((progreso for progreso in fake_db if progreso.id == progreso_id), None)
    if progreso is None:
        raise HTTPException(status_code=404, detail="Progreso not found")
    return progreso

@router.post("/progreso", response_model=Progreso)
async def create_progreso(progreso: Progreso):
    fake_db.append(progreso)
    return progreso

@router.put("/progreso/{progreso_id}", response_model=Progreso)
async def update_progreso(progreso_id: int, progreso: Progreso):
    index = next((i for i, p in enumerate(fake_db) if p.id == progreso_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Progreso not found")
    fake_db[index] = progreso
    return progreso

@router.delete("/progreso/{progreso_id}")
async def delete_progreso(progreso_id: int):
    global fake_db
    fake_db = [progreso for progreso in fake_db if progreso.id != progreso_id]
    return {"detail": "Progreso deleted"}