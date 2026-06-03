"""All-in-one bundle: TODA la plataforma en UN solo proceso (para deploy cloud).

Para que Adam (profesor) valide ScrumDev AI con una sola URL, montamos los 4
bundles (gateway, core, brain, connectors) bajo un mismo FastAPI. Asi un solo
servicio en Render/Railway expone todo el backend.

NO toca el modo local de 4 procesos: esto es un entrypoint ADICIONAL. El
gateway sigue llamando a los bundles por HTTP, pero ahora apuntan a este mismo
proceso (localhost:$PORT) con sus prefijos.

Requiere ALLINONE_MODE=true (lo setea este modulo antes de importar settings).
"""
from __future__ import annotations

import os

# 1) activar modo all-in-one ANTES de importar nada que use settings.
os.environ["ALLINONE_MODE"] = "true"
os.environ["BUNDLE_MODE"] = "true"
_PORT = os.environ.get("PORT", "8080")
# Los servicios internos se montan bajo /_svc/* para NO chocar con las rutas
# propias del gateway (que vive en la raiz "/"). El gateway los llama por HTTP
# a si mismo en ese prefijo interno.
_SELF = f"http://127.0.0.1:{_PORT}/_svc"
os.environ["CORE_BUNDLE_URL"] = _SELF
os.environ["BRAIN_BUNDLE_URL"] = _SELF
os.environ["CONNECTORS_BUNDLE_URL"] = _SELF

from fastapi import FastAPI  # noqa: E402

from services.api_gateway.app.main import app as gateway_app  # noqa: E402
from services.auth_service.app.main import app as auth_app  # noqa: E402
from services.user_service.app.main import app as user_app  # noqa: E402
from services.conversation_service.app.main import app as conversation_app  # noqa: E402
from services.notification_service.app.main import app as notification_app  # noqa: E402
from services.audit_service.app.main import app as audit_app  # noqa: E402
from services.memory_service.app.main import app as memory_app  # noqa: E402
from services.policy_service.app.main import app as policy_app  # noqa: E402
from services.ml_service.app.main import app as ml_app  # noqa: E402
from services.orchestrator_service.app.main import app as orchestrator_app  # noqa: E402
from services.agent_runtime_service.app.main import app as agent_app  # noqa: E402
from services.jira_connector_service.app.main import app as jira_app  # noqa: E402
from services.git_connector_service.app.main import app as git_app  # noqa: E402
from services.deploy_connector_service.app.main import app as deploy_app  # noqa: E402

app = FastAPI(title="ScrumDev AI - All in One", version="1.0.0")


def _start_brokers() -> None:
    """Arranca Redis + Redpanda (Kafka) DENTRO del contenedor de prod (HF Space),
    para que la arquitectura event-driven esté VIVA en prod, no solo en local.
    Totalmente NO-fatal: si un binario falta o falla, el bus cae a logging
    in-process y la app arranca igual (nunca tumba el demo)."""
    import logging, os, shutil, subprocess, socket
    log = logging.getLogger("allinone.brokers")

    def _up(host: str, port: int) -> bool:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except Exception:
            return False

    # Redis (cache / colas ligeras)
    try:
        if shutil.which("redis-server") and not _up("127.0.0.1", 6379):
            subprocess.Popen(["redis-server", "--daemonize", "no", "--save", "",
                              "--appendonly", "no", "--maxmemory", "256mb"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info("redis-server lanzado")
    except Exception as exc:  # noqa: BLE001
        log.warning("redis no arrancó: %s", exc)

    # Redpanda (Kafka-compatible, single binary, sin Zookeeper/JVM). Corre como
    # usuario no-root -> data-dir en /tmp (escribible). Se lanza vía rpk.
    try:
        rpk = shutil.which("rpk")
        if rpk and not _up("127.0.0.1", 9092):
            os.makedirs("/tmp/redpanda", exist_ok=True)
            subprocess.Popen([
                rpk, "redpanda", "start", "--smp=1", "--memory=512M",
                "--reserve-memory=0M", "--overprovisioned", "--node-id=0", "--check=false",
                "--kafka-addr=PLAINTEXT://0.0.0.0:9092",
                "--advertise-kafka-addr=PLAINTEXT://localhost:9092",
                "--set=redpanda.data_directory=/tmp/redpanda",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info("redpanda (kafka) lanzado")
    except Exception as exc:  # noqa: BLE001
        log.warning("redpanda no arrancó: %s", exc)


@app.on_event("startup")
async def _allinone_startup() -> None:
    # Arrancar brokers (Redis + Kafka) en background ANTES de todo -> event-driven
    # vivo en prod. No-fatal.
    try:
        _start_brokers()
    except Exception:  # noqa: BLE001
        pass
    # Los sub-apps montados NO disparan sus propios eventos startup (Starlette),
    # así que creamos las tablas aquí una vez. Crea TODO el esquema porque los
    # modelos se registran globalmente al importarse.
    try:
        from shared.db.session import init_db
        await init_db()
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger("allinone").warning("init_db failed: %s", exc)


@app.get("/_allinone/health")
async def health() -> dict:
    return {"status": "ok", "mode": "allinone",
            "services": ["gateway", "core(8)", "brain(2)", "connectors(3)"]}


@app.get("/_allinone/brokers")
async def brokers_status() -> dict:
    """Diagnóstico de los brokers event-driven en prod (Redis + Kafka/Redpanda)."""
    import shutil, socket, os

    def _port(host: str, port: int) -> bool:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except Exception:
            return False

    return {
        "kafka_enabled_env": os.environ.get("KAFKA_ENABLED"),
        "rpk_binary": bool(shutil.which("rpk")),
        "redis_binary": bool(shutil.which("redis-server")),
        "redis_up_6379": _port("127.0.0.1", 6379),
        "kafka_up_9092": _port("127.0.0.1", 9092),
    }

# servicios internos bajo /_svc/* (el gateway los llama ahi por HTTP)
_svc = FastAPI(title="ScrumDev AI - internal services")
_svc.mount("/auth", auth_app)
_svc.mount("/user", user_app)
_svc.mount("/conversation", conversation_app)
_svc.mount("/notification", notification_app)
_svc.mount("/audit", audit_app)
_svc.mount("/memory", memory_app)
_svc.mount("/policy", policy_app)
_svc.mount("/ml", ml_app)
_svc.mount("/orchestrator", orchestrator_app)
_svc.mount("/agent", agent_app)
_svc.mount("/jira", jira_app)
_svc.mount("/git", git_app)
_svc.mount("/deploy", deploy_app)
app.mount("/_svc", _svc)

# gateway en la raiz: sus rutas (/projects, /chat, /agents, /auth/login...) mandan
app.mount("/", gateway_app)
