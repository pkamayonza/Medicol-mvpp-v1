from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta
from enum import Enum
from typing import List, Optional

import asyncpg
from fastapi import FastAPI, Depends, HTTPException, Request, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
from jose import JWTError, jwt
from pydantic import BaseModel, Field

# CONFIG
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/minza"
)
SUPABASE_JWT_SECRET = os.getenv(
    "SUPABASE_JWT_SECRET", "127cf92f-065a-4601-8278-77d175893f70"
)
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500"
).split(",")

# APP
app = FastAPI(
    title="Minza Health API",
    description="Prescription-to-payment infrastructure for African healthcare.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- DATABASE ----------
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


@app.on_event("startup")
async def startup():
    await get_pool()


@app.on_event("shutdown")
async def shutdown():
    if _pool:
        await _pool.close()


from typing import AsyncGenerator

async def db() -> AsyncGenerator[asyncpg.Connection, None]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


# ---------- AUTH ----------
class TokenPayload(BaseModel):
    sub: str  # Supabase user UUID
    role: str = "anon"
    email: Optional[str] = None


def decode_jwt(token: str) -> TokenPayload:
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return TokenPayload(**payload)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


async def current_user(request: Request) -> TokenPayload:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return decode_jwt(auth.split(" ", 1)[1])


def _org_id_from_token(user: TokenPayload) -> uuid.UUID:
    """The Supabase user UUID is used as the org identifier."""
    return uuid.UUID(user.sub)


# ---------- ENUMS ----------
class VisitStatus(str, Enum):
    waiting = "waiting"
    in_consult = "in_consult"
    completed = "completed"


class BillStatus(str, Enum):
    unpaid = "unpaid"
    partial = "partial"
    paid = "paid"


class PaymentMethod(str, Enum):
    cash = "cash"
    momo = "momo"


class PaymentStatus(str, Enum):
    pending = "pending"
    success = "success"
    failed = "failed"


class OrderStatus(str, Enum):
    sent = "sent"
    accepted = "accepted"
    rejected = "rejected"
    dispensed = "dispensed"


class OrderType(str, Enum):
    internal = "internal"
    external = "external"


class PrescriptionStatus(str, Enum):
    pending = "pending"              # not contacted yet
    contacted = "contacted"          # follow-up sent
    dispensed = "dispensed"          # patient confirmed bought
    not_fulfilled = "not_fulfilled"  # patient did NOT buy
    lost = "lost"                    # auto after 48h

@app.post("/prescriptions/{prescription_id}/follow-up", tags=["Prescriptions"])
async def follow_up_prescription(
    prescription_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)

    row = await conn.fetchrow(
        """
        SELECT pr.id, pt.phone, pt.full_name
        FROM prescriptions pr
        JOIN visits v ON v.id = pr.visit_id
        JOIN patients pt ON pt.id = v.patient_id
        WHERE pr.id = $1 AND v.org_id = $2
        """,
        prescription_id,
        org_id,
    )

    if not row:
        raise HTTPException(404, "Prescription not found")

    if not row["phone"]:
        raise HTTPException(400, "Patient has no phone number")

    message = f"Hi {row['full_name']}, this is your clinic following up. Were you able to get your prescribed medication?"

    whatsapp_link = f"https://wa.me/{row['phone']}?text={message.replace(' ', '%20')}"

    # Update status → contacted
    await conn.execute(
        "UPDATE prescriptions SET status = 'contacted' WHERE id = $1",
        prescription_id,
    )

    return {
        "message": "Follow-up ready",
        "whatsapp_link": whatsapp_link,
    }

    class FollowUpUpdate(BaseModel):
    outcome: str  # "dispensed" or "not_fulfilled"


@app.patch("/prescriptions/{prescription_id}/follow-up", tags=["Prescriptions"])
async def update_follow_up(
    prescription_id: uuid.UUID,
    body: FollowUpUpdate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)

    valid = ["dispensed", "not_fulfilled"]

    if body.outcome not in valid:
        raise HTTPException(400, "Invalid outcome")

    row = await conn.fetchrow(
        """
        UPDATE prescriptions pr
        SET status = $1
        FROM visits v
        WHERE pr.id = $2
          AND pr.visit_id = v.id
          AND v.org_id = $3
        RETURNING pr.*
        """,
        body.outcome,
        prescription_id,
        org_id,
    )

    if not row:
        raise HTTPException(404, "Prescription not found")

    return {"status": body.outcome}


# ---------- MODELS ----------
# Patients
class PatientCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[date] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[date] = None


class PatientOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    full_name: str
    phone: Optional[str]
    gender: Optional[str]
    dob: Optional[date]
    created_at: datetime


# Visits
class VisitCreate(BaseModel):
    patient_id: uuid.UUID


class VisitStatusUpdate(BaseModel):
    status: VisitStatus


class VisitOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    patient_id: uuid.UUID
    status: VisitStatus
    created_at: datetime


# Consultations
class ConsultationCreate(BaseModel):
    visit_id: uuid.UUID
    symptoms: Optional[str] = None
    diagnosis: str = Field(..., min_length=1)
    notes: Optional[str] = None


class ConsultationOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID
    symptoms: Optional[str]
    diagnosis: str
    notes: Optional[str]
    created_at: datetime


# Prescriptions
class PrescriptionItemCreate(BaseModel):
    drug_name: str = Field(..., min_length=1)
    dosage: Optional[str] = None
    quantity: int = Field(1, ge=1)
    price: Optional[float] = Field(None, ge=0)


class PrescriptionCreate(BaseModel):
    visit_id: uuid.UUID
    items: List[PrescriptionItemCreate] = Field(..., min_length=1)


class PrescriptionItemOut(BaseModel):
    id: uuid.UUID
    prescription_id: uuid.UUID
    drug_name: str
    dosage: Optional[str]
    quantity: int
    price: Optional[float]


class PrescriptionOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID
    status: PrescriptionStatus
    created_at: datetime
    items: List[PrescriptionItemOut] = []


# Pharmacy Orders
class PharmacyOrderCreate(BaseModel):
    prescription_id: uuid.UUID
    pharmacy_id: uuid.UUID
    order_type: OrderType


class PharmacyOrderStatusUpdate(BaseModel):
    status: OrderStatus


class PharmacyOrderOut(BaseModel):
    id: uuid.UUID
    prescription_id: uuid.UUID
    clinic_id: uuid.UUID
    pharmacy_id: uuid.UUID
    order_type: OrderType
    status: OrderStatus
    created_at: datetime


# Bills
class BillCreate(BaseModel):
    visit_id: uuid.UUID
    total_amount: float = Field(..., gt=0)


class BillOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID
    total_amount: float
    status: BillStatus
    created_at: datetime


# Payments
class PaymentCreate(BaseModel):
    bill_id: uuid.UUID
    amount: float = Field(..., gt=0)
    method: PaymentMethod
    reference: Optional[str] = None


class PaymentOut(BaseModel):
    id: uuid.UUID
    bill_id: uuid.UUID
    amount: float
    method: PaymentMethod
    status: PaymentStatus
    reference: Optional[str]
    created_at: datetime


# Users (for admin)
class UserCreate(BaseModel):
    name: str
    email: str
    role: str  # admin, doctor, pharmacist, receptionist


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    disabled: bool
    created_at: datetime


# Analytics
class StatsResponse(BaseModel):
    total_visits: int = 0
    total_patients: int = 0
    revenue_today: float = 0
    pending_rx: int = 0


class PrescriptionMetrics(BaseModel):
    total: int
    fulfilled: int
    pending: int
    lost: int


class RevenueResponse(BaseModel):
    total: float


# Frontend-friendly prescription list item
class PrescriptionListItem(BaseModel):
    id: uuid.UUID
    patient_name: str
    drug: str
    status: str
    pharmacy: Optional[str]
    created_at: datetime


# ---------- HELPERS ----------
def record_to_dict(record) -> dict:
    return dict(record) if record else {}


async def _recalculate_bill_status(conn: asyncpg.Connection, bill_id: uuid.UUID) -> None:
    result = await conn.fetchrow(
        """
        SELECT
          b.total_amount,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'success'), 0) AS paid
        FROM bills b
        LEFT JOIN payments p ON p.bill_id = b.id
        WHERE b.id = $1
        GROUP BY b.total_amount
        """,
        bill_id,
    )
    if not result:
        return
    total = float(result["total_amount"])
    paid = float(result["paid"])
    new_status = "unpaid"
    if paid >= total:
        new_status = "paid"
    elif paid > 0:
        new_status = "partial"
    await conn.execute(
        "UPDATE bills SET status = $1 WHERE id = $2",
        new_status,
        bill_id,
    )


# ---------- LOST PRESCRIPTION LOGIC ----------
async def mark_lost_prescriptions():
    """Update prescriptions pending >48h to 'lost'."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE prescriptions
            SET status = 'lost'
            WHERE status = 'pending'
              AND created_at < NOW() - INTERVAL '48 hours'
            """
        )


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(lost_prescription_worker())


async def lost_prescription_worker():
    while True:
        await mark_lost_prescriptions()
        await asyncio.sleep(3600)  # run every hour


# ---------- HEALTH ----------
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "minza-api"}


# ---------- STATS (Dashboard) ----------
@app.get("/stats", response_model=StatsResponse, tags=["Dashboard"])
async def get_stats(
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visits_today = await conn.fetchval(
        "SELECT COUNT(*) FROM visits WHERE org_id = $1 AND DATE(created_at) = CURRENT_DATE",
        org_id,
    )
    total_patients = await conn.fetchval(
        "SELECT COUNT(*) FROM patients WHERE org_id = $1", org_id
    )
    revenue_today = await conn.fetchval(
        """
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        JOIN bills b ON b.id = p.bill_id
        JOIN visits v ON v.id = b.visit_id
        WHERE v.org_id = $1 AND DATE(p.created_at) = CURRENT_DATE AND p.status = 'success'
        """,
        org_id,
    )
    pending_rx = await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM prescriptions pr
        JOIN visits v ON v.id = pr.visit_id
        WHERE v.org_id = $1 AND pr.status = 'pending'
        """,
        org_id,
    )
    return {
        "total_visits": visits_today or 0,
        "total_patients": total_patients or 0,
        "revenue_today": float(revenue_today or 0),
        "pending_rx": pending_rx or 0,
    }


# ---------- ANALYTICS ----------
@app.get("/analytics/revenue", response_model=RevenueResponse, tags=["Analytics"])
async def revenue_by_range(
    range: str = "today",
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    now = datetime.now()
    if range == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range == "week":
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # all
        start = datetime(1970, 1, 1)

    total = await conn.fetchval(
        """
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        JOIN bills b ON b.id = p.bill_id
        JOIN visits v ON v.id = b.visit_id
        WHERE v.org_id = $1 AND p.created_at >= $2 AND p.status = 'success'
        """,
        org_id,
        start,
    )
    return {"total": float(total or 0)}


@app.get("/analytics/prescriptions", response_model=PrescriptionMetrics, tags=["Analytics"])
async def prescription_metrics(
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        """
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE pr.status = 'dispensed') AS fulfilled,
          COUNT(*) FILTER (WHERE pr.status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE pr.status = 'lost') AS lost
        FROM prescriptions pr
        JOIN visits v ON v.id = pr.visit_id
        WHERE v.org_id = $1
        """,
        org_id,
    )
    return {
        "total": row["total"] or 0,
        "fulfilled": row["fulfilled"] or 0,
        "pending": row["pending"] or 0,
        "lost": row["lost"] or 0,
    }


# ---------- PATIENTS ----------
@app.get("/patients", response_model=List[PatientOut], tags=["Patients"])
async def list_patients(
    search: Optional[str] = None,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    if search:
        term = f"%{search}%"
        rows = await conn.fetch(
            """
            SELECT * FROM patients
            WHERE org_id = $1
              AND (full_name ILIKE $2 OR phone ILIKE $2)
            ORDER BY created_at DESC
            """,
            org_id,
            term,
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM patients WHERE org_id = $1 ORDER BY created_at DESC",
            org_id,
        )
    return [record_to_dict(r) for r in rows]


@app.post("/patients", response_model=PatientOut, status_code=201, tags=["Patients"])
async def create_patient(
    body: PatientCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        """
        INSERT INTO patients (org_id, full_name, phone, gender, dob)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        org_id,
        body.full_name,
        body.phone,
        body.gender,
        body.dob,
    )
    return record_to_dict(row)


@app.get("/patients/{patient_id}", response_model=PatientOut, tags=["Patients"])
async def get_patient(
    patient_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        "SELECT * FROM patients WHERE id = $1 AND org_id = $2",
        patient_id,
        org_id,
    )
    if not row:
        raise HTTPException(404, "Patient not found")
    return record_to_dict(row)


@app.patch("/patients/{patient_id}", response_model=PatientOut, tags=["Patients"])
async def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    existing = await conn.fetchrow(
        "SELECT * FROM patients WHERE id = $1 AND org_id = $2",
        patient_id,
        org_id,
    )
    if not existing:
        raise HTTPException(404, "Patient not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return record_to_dict(existing)

    set_clauses = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await conn.fetchrow(
        f"UPDATE patients SET {set_clauses} WHERE id = $1 RETURNING *",
        patient_id,
        *values,
    )
    return record_to_dict(row)


# ---------- VISITS ----------
@app.get("/visits/today", response_model=List[VisitOut], tags=["Visits"])
async def list_todays_visits(
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    rows = await conn.fetch(
        """
        SELECT * FROM visits
        WHERE org_id = $1
          AND created_at >= CURRENT_DATE
        ORDER BY created_at ASC
        """,
        org_id,
    )
    return [record_to_dict(r) for r in rows]


@app.post("/visits", response_model=VisitOut, status_code=201, tags=["Visits"])
async def create_visit(
    body: VisitCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    patient = await conn.fetchrow(
        "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
        body.patient_id,
        org_id,
    )
    if not patient:
        raise HTTPException(404, "Patient not found in this organisation")

    row = await conn.fetchrow(
        """
        INSERT INTO visits (org_id, patient_id, status)
        VALUES ($1, $2, 'waiting')
        RETURNING *
        """,
        org_id,
        body.patient_id,
    )
    return record_to_dict(row)


@app.get("/visits/{visit_id}", response_model=VisitOut, tags=["Visits"])
async def get_visit(
    visit_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        "SELECT * FROM visits WHERE id = $1 AND org_id = $2",
        visit_id,
        org_id,
    )
    if not row:
        raise HTTPException(404, "Visit not found")
    return record_to_dict(row)


@app.patch("/visits/{visit_id}/status", response_model=VisitOut, tags=["Visits"])
async def update_visit_status(
    visit_id: uuid.UUID,
    body: VisitStatusUpdate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        "UPDATE visits SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING *",
        body.status.value,
        visit_id,
        org_id,
    )
    if not row:
        raise HTTPException(404, "Visit not found")
    return record_to_dict(row)


# ---------- CONSULTATIONS ----------
@app.get("/visits/{visit_id}/consultation", response_model=Optional[ConsultationOut], tags=["Consultations"])
async def get_consultation(
    visit_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visit = await conn.fetchrow(
        "SELECT id FROM visits WHERE id = $1 AND org_id = $2",
        visit_id,
        org_id,
    )
    if not visit:
        raise HTTPException(404, "Visit not found")

    row = await conn.fetchrow(
        "SELECT * FROM consultations WHERE visit_id = $1 ORDER BY created_at DESC LIMIT 1",
        visit_id,
    )
    return record_to_dict(row) if row else None


@app.post("/consultations", response_model=ConsultationOut, status_code=201, tags=["Consultations"])
async def create_consultation(
    body: ConsultationCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visit = await conn.fetchrow(
        "SELECT id FROM visits WHERE id = $1 AND org_id = $2",
        body.visit_id,
        org_id,
    )
    if not visit:
        raise HTTPException(404, "Visit not found")

    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO consultations (visit_id, symptoms, diagnosis, notes)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            body.visit_id,
            body.symptoms,
            body.diagnosis,
            body.notes,
        )
        await conn.execute(
            "UPDATE visits SET status = 'completed' WHERE id = $1",
            body.visit_id,
        )
    return record_to_dict(row)


# ---------- PRESCRIPTIONS ----------
@app.get("/prescriptions", response_model=List[PrescriptionListItem], tags=["Prescriptions"])
async def list_prescriptions(
    limit: Optional[int] = None,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    query = """
    SELECT
      pr.id,
      pt.full_name AS patient_name,
      COALESCE(string_agg(pi.drug_name, ', ' ORDER BY pi.drug_name), '') AS drug,
      pr.status,
      po.pharmacy_id::text AS pharmacy,
      pr.created_at
    FROM prescriptions pr
    JOIN visits v ON v.id = pr.visit_id
    JOIN patients pt ON pt.id = v.patient_id
    LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id
    LEFT JOIN pharmacy_orders po ON po.prescription_id = pr.id
    WHERE v.org_id = $1
    GROUP BY pr.id, pt.full_name, po.pharmacy_id
    ORDER BY pr.created_at DESC
    """
    if limit:
        query += " LIMIT $2"
        rows = await conn.fetch(query, org_id, limit)
    else:
        rows = await conn.fetch(query, org_id)
        rows = await conn.fetch(query, org_id)
    return [dict(row) for row in rows]


@app.post("/prescriptions", response_model=PrescriptionOut, status_code=201, tags=["Prescriptions"])
async def create_prescription(
    body: PrescriptionCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visit = await conn.fetchrow(
        "SELECT id FROM visits WHERE id = $1 AND org_id = $2",
        body.visit_id,
        org_id,
    )
    if not visit:
        raise HTTPException(404, "Visit not found")

    async with conn.transaction():
        presc = await conn.fetchrow(
            "INSERT INTO prescriptions (visit_id, status) VALUES ($1, 'pending') RETURNING *",
            body.visit_id,
        )
        presc_id = presc["id"]

        await conn.executemany(
            """
            INSERT INTO prescription_items
              (prescription_id, drug_name, dosage, quantity, price)
            VALUES ($1, $2, $3, $4, $5)
            """,
            [
                (presc_id, item.drug_name, item.dosage, item.quantity, item.price)
                for item in body.items
            ],
        )

        items = await conn.fetch(
            "SELECT * FROM prescription_items WHERE prescription_id = $1",
            presc_id,
        )

    result = record_to_dict(presc)
    result["items"] = [record_to_dict(i) for i in items]
    return result


@app.patch("/prescriptions/{prescription_id}/dispense", tags=["Prescriptions"])
async def dispense_prescription(
    prescription_id: uuid.UUID,
    pharmacist_id: uuid.UUID = Query(..., description="Pharmacist user ID"),
    pharmacy_id: Optional[uuid.UUID] = Query(None),
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    # Verify prescription belongs to org
    presc = await conn.fetchrow(
        """
        SELECT pr.* FROM prescriptions pr
        JOIN visits v ON v.id = pr.visit_id
        WHERE pr.id = $1 AND v.org_id = $2
        """,
        prescription_id,
        org_id,
    )
    if not presc:
        raise HTTPException(404, "Prescription not found")
    if presc["status"] != "pending":
        raise HTTPException(400, f"Cannot dispense prescription with status '{presc['status']}'")

    async with conn.transaction():
        await conn.execute(
            "UPDATE prescriptions SET status = 'dispensed' WHERE id = $1",
            prescription_id,
        )
        await conn.execute(
            """
            INSERT INTO pharmacy_orders (prescription_id, clinic_id, pharmacy_id, order_type, status)
            VALUES ($1, $2, $3, 'internal', 'dispensed')
            """,
            prescription_id,
            org_id,
            pharmacy_id,
        )
    return {"status": "dispensed", "prescription_id": str(prescription_id)}


# ---------- PHARMACY ORDERS ----------
@app.get("/pharmacy/incoming", response_model=List[PharmacyOrderOut], tags=["Pharmacy"])
async def list_incoming_orders(
    status_filter: Optional[OrderStatus] = None,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    query = "SELECT * FROM pharmacy_orders WHERE pharmacy_id = $1"
    params = [org_id]
    if status_filter:
        query += " AND status = $2"
        params.append(status_filter.value)
    query += " ORDER BY created_at DESC"
    rows = await conn.fetch(query, *params)
    return [record_to_dict(r) for r in rows]


@app.get("/pharmacy/sent", response_model=List[PharmacyOrderOut], tags=["Pharmacy"])
async def list_sent_orders(
    status_filter: Optional[OrderStatus] = None,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    query = "SELECT * FROM pharmacy_orders WHERE clinic_id = $1"
    params = [org_id]
    if status_filter:
        query += " AND status = $2"
        params.append(status_filter.value)
    query += " ORDER BY created_at DESC"
    rows = await conn.fetch(query, *params)
    return [record_to_dict(r) for r in rows]


@app.post("/pharmacy/orders", response_model=PharmacyOrderOut, status_code=201, tags=["Pharmacy"])
async def send_to_pharmacy(
    body: PharmacyOrderCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    row = await conn.fetchrow(
        """
        INSERT INTO pharmacy_orders
          (prescription_id, clinic_id, pharmacy_id, order_type, status)
        VALUES ($1, $2, $3, $4, 'sent')
        RETURNING *
        """,
        body.prescription_id,
        org_id,
        body.pharmacy_id,
        body.order_type.value,
    )
    return record_to_dict(row)


@app.patch("/pharmacy/orders/{order_id}/status", response_model=PharmacyOrderOut, tags=["Pharmacy"])
async def update_order_status(
    order_id: uuid.UUID,
    body: PharmacyOrderStatusUpdate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            UPDATE pharmacy_orders
            SET status = $1
            WHERE id = $2 AND (pharmacy_id = $3 OR clinic_id = $3)
            RETURNING *
            """,
            body.status.value,
            order_id,
            org_id,
        )
        if not row:
            raise HTTPException(404, "Order not found or access denied")
        if body.status == OrderStatus.dispensed:
            await conn.execute(
                "UPDATE prescriptions SET status = 'dispensed' WHERE id = $1",
                row["prescription_id"],
            )
    return record_to_dict(row)


# ---------- BILLS ----------
@app.get("/visits/{visit_id}/bill", response_model=Optional[BillOut], tags=["Billing"])
async def get_bill(
    visit_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visit = await conn.fetchrow(
        "SELECT id FROM visits WHERE id = $1 AND org_id = $2",
        visit_id,
        org_id,
    )
    if not visit:
        raise HTTPException(404, "Visit not found")
    row = await conn.fetchrow(
        "SELECT * FROM bills WHERE visit_id = $1 LIMIT 1",
        visit_id,
    )
    return record_to_dict(row) if row else None


@app.post("/bills", response_model=BillOut, status_code=201, tags=["Billing"])
async def create_bill(
    body: BillCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    org_id = _org_id_from_token(user)
    visit = await conn.fetchrow(
        "SELECT id FROM visits WHERE id = $1 AND org_id = $2",
        body.visit_id,
        org_id,
    )
    if not visit:
        raise HTTPException(404, "Visit not found")
    existing = await conn.fetchrow(
        "SELECT id FROM bills WHERE visit_id = $1 LIMIT 1",
        body.visit_id,
    )
    if existing:
        raise HTTPException(409, "Bill already exists for this visit")
    row = await conn.fetchrow(
        "INSERT INTO bills (visit_id, total_amount, status) VALUES ($1, $2, 'unpaid') RETURNING *",
        body.visit_id,
        body.total_amount,
    )
    return record_to_dict(row)


# ---------- PAYMENTS ----------
@app.post("/payments", response_model=PaymentOut, status_code=201, tags=["Payments"])
async def record_payment(
    body: PaymentCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    bill = await conn.fetchrow(
        """
        SELECT b.*, v.org_id FROM bills b
        JOIN visits v ON v.id = b.visit_id
        WHERE b.id = $1
        """,
        body.bill_id,
    )
    if not bill:
        raise HTTPException(404, "Bill not found")
    org_id = _org_id_from_token(user)
    if bill["org_id"] != org_id:
        raise HTTPException(403, "Access denied")

    initial_status = (
        PaymentStatus.success if body.method == PaymentMethod.cash else PaymentStatus.pending
    )

    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO payments (bill_id, amount, method, status, reference)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            body.bill_id,
            body.amount,
            body.method.value,
            initial_status.value,
            body.reference,
        )
        await _recalculate_bill_status(conn, body.bill_id)
    return record_to_dict(row)


@app.get("/bills/{bill_id}/payments", response_model=List[PaymentOut], tags=["Payments"])
async def list_payments(
    bill_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    rows = await conn.fetch(
        "SELECT * FROM payments WHERE bill_id = $1 ORDER BY created_at DESC",
        bill_id,
    )
    return [record_to_dict(r) for r in rows]


# USERS (Admin) 
@app.get("/users", response_model=List[UserOut], tags=["Admin"])
async def list_users(
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    # Admin only – in a real app you'd check user.role
    rows = await conn.fetch(
        "SELECT id, name, email, role, disabled, created_at FROM users ORDER BY name"
    )
    return [dict(row) for row in rows]


@app.post("/users", response_model=UserOut, status_code=201, tags=["Admin"])
async def create_user(
    body: UserCreate,
    conn: asyncpg.Connection = Depends(db),
    user: TokenPayload = Depends(current_user),
):
    # In production, hash password and integrate with Supabase Auth.
    row = await conn.fetchrow(
        """
        INSERT INTO users (name, email, role)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, role, disabled, created_at
        """,
        body.name,
        body.email,
        body.role,
    )
    return dict(row)


@app.delete("/users/{user_id}", tags=["Admin"])
async def delete_user(
    user_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    current: TokenPayload = Depends(current_user),
):
    if user_id == uuid.UUID(current.sub):
        raise HTTPException(400, "Cannot delete yourself")
    await conn.execute("DELETE FROM users WHERE id = $1", user_id)
    return {"status": "deleted"}


@app.patch("/users/{user_id}/revoke", tags=["Admin"])
async def revoke_user(
    user_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(db),
    current: TokenPayload = Depends(current_user),
):
    await conn.execute(
        "UPDATE users SET disabled = true WHERE id = $1",
        user_id,
    )
    return {"status": "revoked"}


# ERROR HANDLERS 
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )