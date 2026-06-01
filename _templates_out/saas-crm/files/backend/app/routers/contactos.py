from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel

router = APIRouter()

class Contacto(BaseModel):
    id: int
    name: str
    phone: str

database = [
    Contacto(id=1, name="Carlos Perez", phone="123456789"),
    Contacto(id=2, name="Ana Gomez", phone="987654321")
]

@router.get("/contactos", response_model=List[Contacto])
async def get_contactos():
    return database

@router.post("/contactos", response_model=Contacto)
async def create_contacto(contacto: Contacto):
    database.append(contacto)
    return contacto

@router.put("/contactos/{contacto_id}", response_model=Contacto)
async def update_contacto(contacto_id: int, contacto: Contacto):
    for idx, existing_contacto in enumerate(database):
        if existing_contacto.id == contacto_id:
            database[idx] = contacto
            return contacto
    raise HTTPException(status_code=404, detail="Contacto not found")

@router.delete("/contactos/{contacto_id}")
async def delete_contacto(contacto_id: int):
    for idx, existing_contacto in enumerate(database):
        if existing_contacto.id == contacto_id:
            del database[idx]
            return {"message": "Contacto deleted"}
    raise HTTPException(status_code=404, detail="Contacto not found")
