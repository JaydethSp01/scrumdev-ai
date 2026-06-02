from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class KitchenOrder(BaseModel):
    id: int
    items: List[str]
    status: str

cocina_orders = [
    KitchenOrder(id=1, items=["Pizza Margherita", "Coke"], status="In Progress"),
    KitchenOrder(id=2, items=["Spaghetti Carbonara"], status="Completed"),
]

@router.get("/cocina", response_model=List[KitchenOrder])
async def get_kitchen_orders():
    return cocina_orders

@router.post("/cocina", response_model=KitchenOrder)
async def create_kitchen_order(order: KitchenOrder):
    cocina_orders.append(order)
    return order

@router.get("/cocina/{order_id}", response_model=KitchenOrder)
async def get_kitchen_order(order_id: int):
    for order in cocina_orders:
        if order.id == order_id:
            return order
    raise HTTPException(status_code=404, detail="Kitchen order not found")

@router.put("/cocina/{order_id}", response_model=KitchenOrder)
async def update_kitchen_order(order_id: int, updated_order: KitchenOrder):
    for index, order in enumerate(cocina_orders):
        if order.id == order_id:
            cocina_orders[index] = updated_order
            return updated_order
    raise HTTPException(status_code=404, detail="Kitchen order not found")

@router.delete("/cocina/{order_id}")
async def delete_kitchen_order(order_id: int):
    for index, order in enumerate(cocina_orders):
        if order.id == order_id:
            del cocina_orders[index]
            return {"detail": "Kitchen order deleted"}
    raise HTTPException(status_code=404, detail="Kitchen order not found")
