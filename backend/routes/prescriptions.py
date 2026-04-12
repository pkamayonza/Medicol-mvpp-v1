from fastapi import APIRouter, HTTPException
from typing import List, Optional
from db import database
from models import PrescriptionCreate, PrescriptionResponse, PrescriptionItemCreate

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

@router.post("/", response_model=dict)
async def create_prescription(data: PrescriptionCreate):
    async with database.transaction():
        # Insert prescription
        query = """
        INSERT INTO prescriptions (patient_id, doctor_id)
        VALUES (:patient_id, :doctor_id)
        RETURNING id
        """
        values = {"patient_id": data.patient_id, "doctor_id": data.doctor_id}
        presc_id = await database.fetch_val(query, values)

        # Insert items
        for item in data.items:
            await database.execute(
                """
                INSERT INTO prescription_items (prescription_id, drug_name, quantity, unit_price)
                VALUES (:prescription_id, :drug_name, :quantity, :unit_price)
                """,
                {
                    "prescription_id": presc_id,
                    "drug_name": item.drug_name,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price
                }
            )
    return {"id": presc_id, "status": "pending"}

@router.get("/", response_model=List[PrescriptionResponse])
async def list_prescriptions(limit: Optional[int] = None):
    query = """
    SELECT
      p.id,
      pt.name AS patient_name,
      string_agg(pi.drug_name, ', ') AS drug,
      p.status,
      d.pharmacy_id::text AS pharmacy,
      p.created_at
    FROM prescriptions p
    JOIN patients pt ON p.patient_id = pt.id
    LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
    LEFT JOIN dispensations d ON d.prescription_id = p.id
    GROUP BY p.id, pt.name, d.pharmacy_id
    ORDER BY p.created_at DESC
    """
    if limit:
        query += f" LIMIT {limit}"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]

@router.patch("/{prescription_id}/fulfill")
async def fulfill_prescription(prescription_id: str, pharmacist_id: str):
    async with database.transaction():
        # Update prescription status
        await database.execute(
            "UPDATE prescriptions SET status = 'fulfilled' WHERE id = :id",
            {"id": prescription_id}
        )
        # Create dispensation record
        await database.execute(
            """
            INSERT INTO dispensations (prescription_id, pharmacist_id)
            VALUES (:prescription_id, :pharmacist_id)
            """,
            {"prescription_id": prescription_id, "pharmacist_id": pharmacist_id}
        )
    return {"status": "fulfilled"}