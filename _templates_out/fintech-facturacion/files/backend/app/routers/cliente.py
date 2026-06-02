from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Cliente(BaseModel):
    id: int
    nombre: str
    email: str

# Mock database
clientes_db = [
    Cliente(id=1, nombre='Cliente A', email='clientea@example.com'),
    Cliente(id=2, nombre='Cliente B', email='clienteb@example.com')
]

@router.get("/cliente", response_model=List[Cliente])
async def get_clientes():
    return clientes_db

@router.post("/cliente", response_model=Cliente)
async def create_cliente(cliente: Cliente):
    clientes_db.append(cliente)
    return cliente

@router.get("/cliente/{cliente_id}", response_model=Cliente)
async def get_cliente(cliente_id: int):
    cliente = next((c for c in clientes_db if c.id == cliente_id), None)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente not found")
    return cliente

@router.delete("/cliente/{cliente_id}", response_model=Cliente)
async def delete_cliente(cliente_id: int):
    cliente = next((c for c in clientes_db if c.id == cliente_id), None)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente not found")
    clientes_db.remove(cliente)
    return cliente
