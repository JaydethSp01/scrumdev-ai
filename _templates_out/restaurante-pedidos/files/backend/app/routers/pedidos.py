from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Order(BaseModel):
    id: int
    tableNumber: int
    items: List[str]
    status: str

pedidos = [
    Order(id=1, tableNumber=1, items=["Pizza Margherita", "Coke"], status="Pending"),
    Order(id=2, tableNumber=2, items=["Spaghetti Carbonara"], status="Served"),
]

@router.get("/pedidos", response_model=List[Order])
async def get_orders():
    return pedidos

@router.post("/pedidos", response_model=Order)
async def create_order(order: Order):
    pedidos.append(order)
    return order

@router.get("/pedidos/{order_id}", response_model=Order)
async def get_order(order_id: int):
    for order in pedidos:
        if order.id == order_id:
            return order
    raise HTTPException(status_code=404, detail="Order not found")

@router.put("/pedidos/{order_id}", response_model=Order)
async def update_order(order_id: int, updated_order: Order):
    for index, order in enumerate(pedidos):
        if order.id == order_id:
            pedidos[index] = updated_order
            return updated_order
    raise HTTPException(status_code=404, detail="Order not found")

@router.delete("/pedidos/{order_id}")
async def delete_order(order_id: int):
    for index, order in enumerate(pedidos):
        if order.id == order_id:
            del pedidos[index]
            return {"detail": "Order deleted"}
    raise HTTPException(status_code=404, detail="Order not found")
