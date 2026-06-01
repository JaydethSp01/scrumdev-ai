from fastapi import APIRouter

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_metrics():
    # Simulación de métricas
    metrics = {
        "totalLeads": 100,
        "totalOportunidades": 50,
        "conversionRate": 20.0
    }
    return metrics
