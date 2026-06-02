from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Curso(BaseModel):
    id: int
    title: str
    description: str

fake_db = [
    Curso(id=1, title="Curso de Python", description="Aprende Python desde cero"),
    Curso(id=2, title="Curso de JavaScript", description="Domina JavaScript y construye aplicaciones web"),
]

@router.get("/curso", response_model=List[Curso])
async def get_cursos():
    return fake_db

@router.get("/curso/{curso_id}", response_model=Curso)
async def get_curso(curso_id: int):
    curso = next((curso for curso in fake_db if curso.id == curso_id), None)
    if curso is None:
        raise HTTPException(status_code=404, detail="Curso not found")
    return curso

@router.post("/curso", response_model=Curso)
async def create_curso(curso: Curso):
    fake_db.append(curso)
    return curso

@router.put("/curso/{curso_id}", response_model=Curso)
async def update_curso(curso_id: int, curso: Curso):
    index = next((i for i, c in enumerate(fake_db) if c.id == curso_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Curso not found")
    fake_db[index] = curso
    return curso

@router.delete("/curso/{curso_id}")
async def delete_curso(curso_id: int):
    global fake_db
    fake_db = [curso for curso in fake_db if curso.id != curso_id]
    return {"detail": "Curso deleted"}