from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Propiedad(BaseModel):
    id: int
    nombre: str
    descripcion: str
    precio: float

propiedades_db = [
    Propiedad(id=1, nombre="Casa en la playa", descripcion="Hermosa casa con vista al mar", precio=300000.0),
    Propiedad(id=2, nombre="Apartamento en la ciudad", descripcion="Moderno apartamento en el centro", precio=150000.0),
]

@router.get("/propiedades", response_model=List[Propiedad])
async def get_propiedades():
    return propiedades_db

@router.post("/propiedades", response_model=Propiedad)
async def create_propiedad(propiedad: Propiedad):
    propiedades_db.append(propiedad)
    return propiedad

@router.put("/propiedades/{propiedad_id}", response_model=Propiedad)
async def update_propiedad(propiedad_id: int, propiedad: Propiedad):
    for index, p in enumerate(propiedades_db):
        if p.id == propiedad_id:
            propiedades_db[index] = propiedad
            return propiedad
    raise HTTPException(status_code=404, detail="Propiedad not found")

@router.delete("/propiedades/{propiedad_id}")
async def delete_propiedad(propiedad_id: int):
    for index, p in enumerate(propiedades_db):
        if p.id == propiedad_id:
            del propiedades_db[index]
            return {"message": "Propiedad deleted"}
    raise HTTPException(status_code=404, detail="Propiedad not found")
