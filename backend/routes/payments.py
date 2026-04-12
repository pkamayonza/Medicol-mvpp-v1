from fastapi import APIRouter, HTTPException
from uuid import UUID
from db import database
from models import PaymentCreate, Payment

router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("/", response_model=Payment)
async def create_payment(data: PaymentCreate):
    async with database.transaction():
        # Check prescription status
        status = await database.fetch_val(
            "SELECT status FROM prescriptions WHERE id = :id",
            {"id": data.prescription_id}
        )
        if not status:
            raise HTTPException(status_code=404, detail="Prescription not found")
        if status != "fulfilled":
            raise HTTPException(
                status_code=400,
                detail="Cannot pay for unfulfilled prescription"
            )

        # Insert payment
        query = """
        INSERT INTO payments (prescription_id, amount)
        VALUES (:prescription_id, :amount)
        RETURNING id, prescription_id, amount, status, created_at
        """
        values = {"prescription_id": data.prescription_id, "amount": data.amount}
        row = await database.fetch_one(query, values)
    return dict(row)