"""Worker Temporal. Ejecutar como proceso separado solo si TEMPORAL_ENABLED=true."""
from __future__ import annotations

import asyncio

from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from temporal.workflows.software_delivery_workflow import (
    SoftwareDeliveryWorkflow,
    run_crew_activity,
)


async def main() -> None:
    configure_logging("temporal-worker", debug=settings.app_debug)
    logger = get_logger(__name__)

    if not settings.temporal_enabled:
        logger.warning("temporal_disabled_exiting")
        return

    from temporalio.client import Client
    from temporalio.worker import Worker

    client = await Client.connect(
        settings.temporal_host, namespace=settings.temporal_namespace
    )
    logger.info("temporal_worker_starting", queue=settings.temporal_task_queue)

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[SoftwareDeliveryWorkflow],
        activities=[run_crew_activity],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
