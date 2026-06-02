from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Impuesto(BaseModel):
    id: int
    descripcion: str
    tasa: float

# Mock database
impuestos_db = [
    Impuesto(id=1, descripcion='IVA', tasa=0.21),
    Impuesto(id=2, descripcion='IGIC', tasa=0.07)
]

@router.get("/impuesto", response_model=List[Impuesto])
async def get_impuestos():
    return impuestos_db

@router.post("/impuesto", response_model=Impuesto)
async def create_impuesto(impuesto: Impuesto):
    impuestos_db.append(impuesto)
    return impuesto

@router.get("/impuesto/{impuesto_id}", response_model=Impuesto)
async def get_impuesto(impuesto_id: int):
    impuesto = next((i for i in impuestos_db if i.id == impuesto_id), None)
    if impuesto is None:
        raise HTTPException(status_code=404, detail="Impuesto not found")
    return impuesto

@router.delete("/impuesto/{impuesto_id}", response_model=Impuesto)
async def delete_impuesto(impuesto_id: int):
    impuesto = next((i for i in impuestos_db if i.id == impuesto_id), None)
    if impuesto is None:
        raise HTTPException(status_code=404, detail="Impuesto not found")
    impuestos_db.remove(impuesto)
    return impuesto
