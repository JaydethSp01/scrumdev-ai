from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Pago(BaseModel):
    id: int
    factura: int
    monto: float
    fecha: str

# Mock database
pagos_db = [
    Pago(id=1, factura=1, monto=100.0, fecha='2023-10-10'),
    Pago(id=2, factura=2, monto=150.0, fecha='2023-10-12')
]

@router.get("/pago", response_model=List[Pago])
async def get_pagos():
    return pagos_db

@router.post("/pago", response_model=Pago)
async def create_pago(pago: Pago):
    pagos_db.append(pago)
    return pago

@router.get("/pago/{pago_id}", response_model=Pago)
async def get_pago(pago_id: int):
    pago = next((p for p in pagos_db if p.id == pago_id), None)
    if pago is None:
        raise HTTPException(status_code=404, detail="Pago not found")
    return pago

@router.delete("/pago/{pago_id}", response_model=Pago)
async def delete_pago(pago_id: int):
    pago = next((p for p in pagos_db if p.id == pago_id), None)
    if pago is None:
        raise HTTPException(status_code=404, detail="Pago not found")
    pagos_db.remove(pago)
    return pago
