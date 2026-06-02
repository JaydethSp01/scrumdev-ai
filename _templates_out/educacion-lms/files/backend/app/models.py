from pydantic import BaseModel

class Curso(BaseModel):
    id: int
    title: str
    description: str