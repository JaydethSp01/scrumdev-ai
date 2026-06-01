from fastapi import APIRouter, HTTPException
from typing import List
from ..models import Customer
from ..database import SessionLocal

router = APIRouter()

@router.get("/cliente", response_model=List[Customer])
async def read_customers():
    db = SessionLocal()
    customers = db.query(Customer).all()
    return customers

@router.post("/cliente", response_model=Customer)
async def create_customer(customer: Customer):
    db = SessionLocal()
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@router.get("/cliente/{customer_id}", response_model=Customer)
async def read_customer(customer_id: int):
    db = SessionLocal()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.put("/cliente/{customer_id}", response_model=Customer)
async def update_customer(customer_id: int, customer: Customer):
    db = SessionLocal()
    db_customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if db_customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in customer.dict().items():
        setattr(db_customer, key, value)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.delete("/cliente/{customer_id}")
async def delete_customer(customer_id: int):
    db = SessionLocal()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return {"detail": "Customer deleted"}
