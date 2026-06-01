from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel

router = APIRouter()

class Lead(BaseModel):
    id: int
    name: str
    email: str

database = [
    Lead(id=1, name="John Doe", email="john@example.com"),
    Lead(id=2, name="Jane Smith", email="jane@example.com")
]

@router.get("/leads", response_model=List[Lead])
async def get_leads():
    return database

@router.post("/leads", response_model=Lead)
async def create_lead(lead: Lead):
    database.append(lead)
    return lead

@router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: int, lead: Lead):
    for idx, existing_lead in enumerate(database):
        if existing_lead.id == lead_id:
            database[idx] = lead
            return lead
    raise HTTPException(status_code=404, detail="Lead not found")

@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: int):
    for idx, existing_lead in enumerate(database):
        if existing_lead.id == lead_id:
            del database[idx]
            return {"message": "Lead deleted"}
    raise HTTPException(status_code=404, detail="Lead not found")
