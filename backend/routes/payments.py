from fastapi import APIRouter
from db import database
from models import PaymentCreate, Payment

router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("/", response_model=Payment)
async def create_payment(data: PaymentCreate):
    query = """
    INSERT INTO payments (prescription_id, amount)
    VALUES (:prescription_id, :amount)
    RETURNING id, prescription_id, amount, status, created_at
    """
    values = {"prescription_id": data.prescription_id, "amount": data.amount}
    row = await database.fetch_one(query, values)
    return dict(row)