import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Los tests unitarios del event_bus usan el bus IN-MEMORY. Deshabilitar Kafka
# y RabbitMQ para que no intenten conectar a brokers reales (que cuelgan el
# event loop del test). El E2E de bundle no toca el bus directamente.
os.environ.setdefault("_FORCE_INMEM_BUS", "1")
try:
    from shared.config.settings import settings as _settings
    _settings.kafka_enabled = False
    _settings.rabbitmq_enabled = False
except Exception:
    pass
