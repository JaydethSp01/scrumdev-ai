from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Certificado(BaseModel):
    id: int
    estudianteId: int
    cursoId: int
    fechaEmision: str

fake_db = [
    Certificado(id=1, estudianteId=1, cursoId=1, fechaEmision="2023-01-01"),
    Certificado(id=2, estudianteId=2, cursoId=2, fechaEmision="2023-02-01"),
]

@router.get("/certificado", response_model=List[Certificado])
async def get_certificados():
    return fake_db

@router.get("/certificado/{certificado_id}", response_model=Certificado)
async def get_certificado(certificado_id: int):
    certificado = next((certificado for certificado in fake_db if certificado.id == certificado_id), None)
    if certificado is None:
        raise HTTPException(status_code=404, detail="Certificado not found")
    return certificado

@router.post("/certificado", response_model=Certificado)
async def create_certificado(certificado: Certificado):
    fake_db.append(certificado)
    return certificado

@router.put("/certificado/{certificado_id}", response_model=Certificado)
async def update_certificado(certificado_id: int, certificado: Certificado):
    index = next((i for i, c in enumerate(fake_db) if c.id == certificado_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Certificado not found")
    fake_db[index] = certificado
    return certificado

@router.delete("/certificado/{certificado_id}")
async def delete_certificado(certificado_id: int):
    global fake_db
    fake_db = [certificado for certificado in fake_db if certificado.id != certificado_id]
    return {"detail": "Certificado deleted"}