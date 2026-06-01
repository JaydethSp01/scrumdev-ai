from fastapi import APIRouter, HTTPException
from typing import List
from ..models import Product
from ..database import SessionLocal

router = APIRouter()

@router.get("/producto", response_model=List[Product])
async def read_products():
    db = SessionLocal()
    products = db.query(Product).all()
    return products

@router.post("/producto", response_model=Product)
async def create_product(product: Product):
    db = SessionLocal()
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.get("/producto/{product_id}", response_model=Product)
async def read_product(product_id: int):
    db = SessionLocal()
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/producto/{product_id}", response_model=Product)
async def update_product(product_id: int, product: Product):
    db = SessionLocal()
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in product.dict().items():
        setattr(db_product, key, value)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.delete("/producto/{product_id}")
async def delete_product(product_id: int):
    db = SessionLocal()
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"detail": "Product deleted"}
