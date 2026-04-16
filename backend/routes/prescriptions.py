from fastapi import APIRouter, HTTPException
from typing import List, Optional
from uuid import UUID
from db import database
from models import (
    PrescriptionCreate, PrescriptionResponse, PrescriptionItemCreate,
    DispenseRequest, PrescriptionMetrics
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

@router.post("/", response_model=dict)
async def create_prescription(data: PrescriptionCreate):
    async with database.transaction():
        # Create prescription with default 'pending' status
        query = """
            INSERT INTO prescriptions (patient_id, doctor_id, clinic_id, pharmacy_id, status)
            VALUES (:patient_id, :doctor_id, :clinic_id, :pharmacy_id, 'sent')
            RETURNING *;
        """
        values = {
            "patient_id": data.patient_id,
            "doctor_id": data.doctor_id,
            "clinic_id": data.clinic_id,
            "pharmacy_id": data.pharmacy_id
}
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
    return {
    "id": str(presc_id),
    "status": "sent",
    "items": [item.dict() for item in data.items]
}


@router.get("/", response_model=List[PrescriptionResponse])
async def list_prescriptions(limit: Optional[int] = None):
    query = """
    SELECT
      p.id,
      pt.name AS patient_name,
      COALESCE(string_agg(pi.drug_name, ', ' ORDER BY pi.drug_name), '') AS drug,
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


@router.patch("/{prescription_id}/dispense")
async def dispense_prescription(prescription_id: UUID, data: DispenseRequest):
    async with database.transaction():
        # Verify prescription exists and is pending
        current_status = await database.fetch_val(
            "SELECT status FROM prescriptions WHERE id = :id",
            {"id": prescription_id}
        )
        if not current_status:
            raise HTTPException(status_code=404, detail="Prescription not found")
        if current_status not in ("pending", "sent"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot dispense prescription with status '{current_status}'"
            )

        # Update status to fulfilled
        await database.execute(
            "UPDATE prescriptions SET status = 'dispensed' WHERE id = :id",
            {"id": prescription_id}
        )

        # Insert dispensation record
        await database.execute(
            """
            await database.execute(
            """
            INSERT INTO dispensations (prescription_id, pharmacist_id)
            VALUES (:prescription_id, :pharmacist_id)
            """,
        {
            "prescription_id": prescription_id,
            "pharmacist_id": data.pharmacist_id
        }
    )
            VALUES (:prescription_id, :pharmacist_id, :pharmacy_id)
            """,
            {
                "prescription_id": prescription_id,
                "pharmacist_id": data.pharmacist_id,
                "pharmacy_id": data.pharmacy_id
            }
        )
    return {"status": "dispensed", "prescription_id": str(prescription_id)}


# Optional: mark lost function (to be called by background task)
async def mark_lost_prescriptions():
    """
    Find prescriptions where status = 'pending' and created_at older than 48 hours,
    then update status to 'lost'.
    """
    query = """
    UPDATE prescriptions
    SET status = 'lost'
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '48 hours'
    """
    await database.execute(query)