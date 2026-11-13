"""Evidence rig: the management server on 127.0.0.1:8899 with a mocked Gallabox and an SMTP
sender that only records. Test data only; nothing leaves this machine."""
import asyncio, json, sys, secrets
from pathlib import Path
import httpx, uvicorn
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.server.vault import Vault
sys.path.insert(0, str(Path.cwd()))
from tests.cloud.test_gallabox import FakeGallabox, KEY, SECRET, ACCOUNT, CHANNEL, TEMPLATES

TEMPLATES.append({"name": "demo_booked", "language": "ar", "category": "UTILITY", "status": "APPROVED",
  "components": [{"type": "BODY", "text": "مرحبا {{name}}، تم تأكيد العرض التوضيحي يوم {{date}}.", "example": {"body_text": [["سارة", "الأحد"]]}}]})
db = Path(sys.argv[1]); db.unlink(missing_ok=True)
store = CloudStore(db, Vault("e" * 40))
fake = FakeGallabox()
async def record(account, mail):
    print("SMTP (recorded only):", mail.to, mail.subject, flush=True)
config = CloudConfig(public_origin="http://127.0.0.1:8899", static_dir=None,
                     smtp_sender=record, gallabox_transport=httpx.MockTransport(fake.handler))
app = create_cloud_app(config, store, Seed.load())
uvicorn.run(app, host="127.0.0.1", port=8899, log_level="warning")
