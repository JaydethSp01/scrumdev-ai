from fastapi import APIRouter, HTTPException
from typing import List
from ..models import CartItem
from ..database import SessionLocal

router = APIRouter()

@router.get("/carrito", response_model=List[CartItem])
async def read_cart_items():
    db = SessionLocal()
    cart_items = db.query(CartItem).all()
    return cart_items

@router.post("/carrito", response_model=CartItem)
async def create_cart_item(cart_item: CartItem):
    db = SessionLocal()
    db.add(cart_item)
    db.commit()
    db.refresh(cart_item)
    return cart_item

@router.get("/carrito/{cart_item_id}", response_model=CartItem)
async def read_cart_item(cart_item_id: int):
    db = SessionLocal()
    cart_item = db.query(CartItem).filter(CartItem.id == cart_item_id).first()
    if cart_item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return cart_item

@router.put("/carrito/{cart_item_id}", response_model=CartItem)
async def update_cart_item(cart_item_id: int, cart_item: CartItem):
    db = SessionLocal()
    db_cart_item = db.query(CartItem).filter(CartItem.id == cart_item_id).first()
    if db_cart_item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    for key, value in cart_item.dict().items():
        setattr(db_cart_item, key, value)
    db.commit()
    db.refresh(db_cart_item)
    return db_cart_item

@router.delete("/carrito/{cart_item_id}")
async def delete_cart_item(cart_item_id: int):
    db = SessionLocal()
    cart_item = db.query(CartItem).filter(CartItem.id == cart_item_id).first()
    if cart_item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(cart_item)
    db.commit()
    return {"detail": "Cart item deleted"}
