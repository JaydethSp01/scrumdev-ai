from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Table(BaseModel):
    id: int
    number: int
    status: str

mesas = [
    Table(id=1, number=1, status="Available"),
    Table(id=2, number=2, status="Occupied"),
]

@router.get("/mesas", response_model=List[Table])
async def get_tables():
    return mesas

@router.post("/mesas", response_model=Table)
async def create_table(table: Table):
    mesas.append(table)
    return table

@router.get("/mesas/{table_id}", response_model=Table)
async def get_table(table_id: int):
    for table in mesas:
        if table.id == table_id:
            return table
    raise HTTPException(status_code=404, detail="Table not found")

@router.put("/mesas/{table_id}", response_model=Table)
async def update_table(table_id: int, updated_table: Table):
    for index, table in enumerate(mesas):
        if table.id == table_id:
            mesas[index] = updated_table
            return updated_table
    raise HTTPException(status_code=404, detail="Table not found")

@router.delete("/mesas/{table_id}")
async def delete_table(table_id: int):
    for index, table in enumerate(mesas):
        if table.id == table_id:
            del mesas[index]
            return {"detail": "Table deleted"}
    raise HTTPException(status_code=404, detail="Table not found")
