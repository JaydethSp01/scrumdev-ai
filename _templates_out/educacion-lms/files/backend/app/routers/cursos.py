from fastapi import APIRouter, HTTPException
from app.models import Curso

router = APIRouter()

MOCK_CURSOS = [
    Curso(id=1, title="Curso de Python", description="Aprende Python desde cero"),
    Curso(id=2, title="Curso de JavaScript", description="Domina JavaScript a fondo")
]

@router.get("/cursos")
async def list_cursos():
    return MOCK_CURSOS

@router.get("/cursos/{curso_id}")
async def get_curso(curso_id: int):
    for curso in MOCK_CURSOS:
        if curso.id == curso_id:
            return curso
    raise HTTPException(status_code=404, detail="Curso no encontrado")

@router.post("/cursos")
async def create_curso(curso: Curso):
    MOCK_CURSOS.append(curso)
    return curso

@router.put("/cursos/{curso_id}")
async def update_curso(curso_id: int, curso: Curso):
    for idx, existing_curso in enumerate(MOCK_CURSOS):
        if existing_curso.id == curso_id:
            MOCK_CURSOS[idx] = curso
            return curso
    raise HTTPException(status_code=404, detail="Curso no encontrado")

@router.delete("/cursos/{curso_id}")
async def delete_curso(curso_id: int):
    for idx, curso in enumerate(MOCK_CURSOS):
        if curso.id == curso_id:
            del MOCK_CURSOS[idx]
            return {"msg": "Curso eliminado"}
    raise HTTPException(status_code=404, detail="Curso no encontrado")