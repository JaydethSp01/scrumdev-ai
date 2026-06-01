from fastapi import APIRouter, HTTPException
from typing import List
from ..models import Order
from ..database import SessionLocal

router = APIRouter()

@router.get("/pedido", response_model=List[Order])
async def read_orders():
    db = SessionLocal()
    orders = db.query(Order).all()
    return orders

@router.post("/pedido", response_model=Order)
async def create_order(order: Order):
    db = SessionLocal()
    db.add(order)
    db.commit()
    db.refresh(order)
    return order

@router.get("/pedido/{order_id}", response_model=Order)
async def read_order(order_id: int):
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/pedido/{order_id}", response_model=Order)
async def update_order(order_id: int, order: Order):
    db = SessionLocal()
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    for key, value in order.dict().items():
        setattr(db_order, key, value)
    db.commit()
    db.refresh(db_order)
    return db_order

@router.delete("/pedido/{order_id}")
async def delete_order(order_id: int):
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()
    return {"detail": "Order deleted"}
