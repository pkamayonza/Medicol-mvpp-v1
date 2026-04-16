from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID

# Patients
class PatientBase(BaseModel):
    name: str
    phone: Optional[str] = None

class Patient(PatientBase):
    id: UUID
    created_at: datetime

# Users
class UserBase(BaseModel):
    name: str
    email: str
    role: str

class User(UserBase):
    id: UUID
    disabled: bool = False
    created_at: datetime

# Prescription Items
class PrescriptionItemCreate(BaseModel):
    drug_name: str
    quantity: int
    unit_price: float = 0

class PrescriptionItem(PrescriptionItemCreate):
    id: UUID
    total: float

# Prescriptions
class PrescriptionCreate(BaseModel):
    patient_id: UUID
    doctor_id: UUID
    clinic_id: UUID
    pharmacy_id: UUID
    items: List[PrescriptionItemCreate]

class PrescriptionResponse(BaseModel):
    id: UUID
    patient_name: str
    drug: str  # first drug name (concatenated if multiple)
    status: str
    pharmacy: Optional[str] = None
    created_at: datetime

# Payments
class PaymentCreate(BaseModel):
    prescription_id: UUID
    amount: float

class Payment(PaymentCreate):
    id: UUID
    status: str
    created_at: datetime

# Stats
class StatsResponse(BaseModel):
    total_visits: int = 0
    total_patients: int = 0
    revenue_today: float = 0
    pending_rx: int = 0

class PrescriptionMetrics(BaseModel):
    total: int
    dispensed: int
    pending: int
    unavailable: int

class RevenueResponse(BaseModel):
    total: float

class DispenseRequest(BaseModel):
    pharmacist_id: UUID

class PrescriptionMetrics(BaseModel):
    total: int
    dispensed: int
    pending: int
    unavailable: int