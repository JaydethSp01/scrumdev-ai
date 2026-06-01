from fastapi import APIRouter, HTTPException
from typing import List
from ..models import Category
from ..database import SessionLocal

router = APIRouter()

@router.get("/categoria", response_model=List[Category])
async def read_categories():
    db = SessionLocal()
    categories = db.query(Category).all()
    return categories

@router.post("/categoria", response_model=Category)
async def create_category(category: Category):
    db = SessionLocal()
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.get("/categoria/{category_id}", response_model=Category)
async def read_category(category_id: int):
    db = SessionLocal()
    category = db.query(Category).filter(Category.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return category

@router.put("/categoria/{category_id}", response_model=Category)
async def update_category(category_id: int, category: Category):
    db = SessionLocal()
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in category.dict().items():
        setattr(db_category, key, value)
    db.commit()
    db.refresh(db_category)
    return db_category

@router.delete("/categoria/{category_id}")
async def delete_category(category_id: int):
    db = SessionLocal()
    category = db.query(Category).filter(Category.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
    return {"detail": "Category deleted"}
