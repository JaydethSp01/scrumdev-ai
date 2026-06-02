from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Factura(BaseModel):
    id: int
    cliente: str
    monto: float
    fecha: str

# Mock database
facturas_db = [
    Factura(id=1, cliente='Cliente A', monto=100.0, fecha='2023-10-01'),
    Factura(id=2, cliente='Cliente B', monto=150.0, fecha='2023-10-05')
]

@router.get("/factura", response_model=List[Factura])
async def get_facturas():
    return facturas_db

@router.post("/factura", response_model=Factura)
async def create_factura(factura: Factura):
    facturas_db.append(factura)
    return factura

@router.get("/factura/{factura_id}", response_model=Factura)
async def get_factura(factura_id: int):
    factura = next((f for f in facturas_db if f.id == factura_id), None)
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura not found")
    return factura

@router.delete("/factura/{factura_id}", response_model=Factura)
async def delete_factura(factura_id: int):
    factura = next((f for f in facturas_db if f.id == factura_id), None)
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura not found")
    facturas_db.remove(factura)
    return factura
