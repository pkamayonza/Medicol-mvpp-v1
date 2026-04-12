from fastapi import APIRouter, HTTPException
from typing import List
from db import database
from models import User, UserBase

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[User])
async def list_users():
    query = "SELECT id, name, email, role, disabled, created_at FROM users ORDER BY name"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]

@router.post("/", response_model=User)
async def create_user(data: UserBase):
    # In a real app, hash password; here we assume Supabase Auth handles auth
    query = """
    INSERT INTO users (name, email, role)
    VALUES (:name, :email, :role)
    RETURNING id, name, email, role, disabled, created_at
    """
    values = data.dict()
    row = await database.fetch_one(query, values)
    return dict(row)

@router.delete("/{user_id}")
async def delete_user(user_id: str):
    await database.execute("DELETE FROM users WHERE id = :id", {"id": user_id})
    return {"status": "deleted"}

@router.patch("/{user_id}/revoke")
async def revoke_user(user_id: str):
    await database.execute(
        "UPDATE users SET disabled = true WHERE id = :id",
        {"id": user_id}
    )
    return {"status": "revoked"}