from fastapi import APIRouter, Query
from db import database
from models import StatsResponse, PrescriptionMetrics, RevenueResponse
from datetime import datetime, timedelta

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    # Total visits today
    visits_today = await database.fetch_val(
        "SELECT COUNT(*) FROM prescriptions WHERE DATE(created_at) = CURRENT_DATE"
    )
    # Total patients
    total_patients = await database.fetch_val("SELECT COUNT(*) FROM patients")
    # Revenue today
    revenue_today = await database.fetch_val(
        "SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE(created_at) = CURRENT_DATE"
    )
    # Pending prescriptions
    pending_rx = await database.fetch_val(
        "SELECT COUNT(*) FROM prescriptions WHERE status = 'pending'"
    )
    return {
        "total_visits": visits_today,
        "total_patients": total_patients,
        "revenue_today": float(revenue_today),
        "pending_rx": pending_rx
    }

@router.get("/prescriptions", response_model=PrescriptionMetrics)
async def prescription_metrics():
    total = await database.fetch_val("SELECT COUNT(*) FROM prescriptions")
    fulfilled = await database.fetch_val("SELECT COUNT(*) FROM prescriptions WHERE status = 'fulfilled'")
    pending = await database.fetch_val("SELECT COUNT(*) FROM prescriptions WHERE status = 'pending'")
    lost = await database.fetch_val("SELECT COUNT(*) FROM prescriptions WHERE status = 'lost'")
    return {"total": total, "fulfilled": fulfilled, "pending": pending, "lost": lost}

@router.get("/revenue", response_model=RevenueResponse)
async def revenue_by_range(range: str = Query("today", enum=["today","week","month","all"])):
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

    total = await database.fetch_val(
        "SELECT COALESCE(SUM(amount),0) FROM payments WHERE created_at >= :start",
        {"start": start}
    )
    return {"total": float(total)}