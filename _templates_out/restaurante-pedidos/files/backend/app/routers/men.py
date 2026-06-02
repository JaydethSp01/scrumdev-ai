from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

router = APIRouter()

class MenuItem(BaseModel):
    id: int
    name: str
    description: str
    price: float

menu_items = [
    MenuItem(id=1, name="Pizza Margherita", description="Classic pizza with tomatoes and mozzarella", price=8.99),
    MenuItem(id=2, name="Spaghetti Carbonara", description="Pasta with eggs, cheese, pancetta, and pepper", price=12.99),
]

@router.get("/men", response_model=List[MenuItem])
async def get_menu_items():
    return menu_items

@router.post("/men", response_model=MenuItem)
async def create_menu_item(item: MenuItem):
    menu_items.append(item)
    return item

@router.get("/men/{item_id}", response_model=MenuItem)
async def get_menu_item(item_id: int):
    for item in menu_items:
        if item.id == item_id:
            return item
    raise HTTPException(status_code=404, detail="Menu item not found")

@router.put("/men/{item_id}", response_model=MenuItem)
async def update_menu_item(item_id: int, updated_item: MenuItem):
    for index, item in enumerate(menu_items):
        if item.id == item_id:
            menu_items[index] = updated_item
            return updated_item
    raise HTTPException(status_code=404, detail="Menu item not found")

@router.delete("/men/{item_id}")
async def delete_menu_item(item_id: int):
    for index, item in enumerate(menu_items):
        if item.id == item_id:
            del menu_items[index]
            return {"detail": "Menu item deleted"}
    raise HTTPException(status_code=404, detail="Menu item not found")
