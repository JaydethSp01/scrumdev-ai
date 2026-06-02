from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Cliente(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: str

clientes_db = [
    Cliente(id=1, nombre="Carlos Ruiz", email="carlos.ruiz@example.com", telefono="1112223333"),
    Cliente(id=2, nombre="Ana Lopez", email="ana.lopez@example.com", telefono="4445556666"),
]

@router.get("/clientes", response_model=List[Cliente])
async def get_clientes():
    return clientes_db

@router.post("/clientes", response_model=Cliente)
async def create_cliente(cliente: Cliente):
    clientes_db.append(cliente)
    return cliente

@router.put("/clientes/{cliente_id}", response_model=Cliente)
async def update_cliente(cliente_id: int, cliente: Cliente):
    for index, c in enumerate(clientes_db):
        if c.id == cliente_id:
            clientes_db[index] = cliente
            return cliente
    raise HTTPException(status_code=404, detail="Cliente not found")

@router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: int):
    for index, c in enumerate(clientes_db):
        if c.id == cliente_id:
            del clientes_db[index]
            return {"message": "Cliente deleted"}
    raise HTTPException(status_code=404, detail="Cliente not found")
