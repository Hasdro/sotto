import httpx, json, secrets, sys
sys.path.insert(0, ".")
from tests.cloud.test_gallabox import CREDS
B = "http://127.0.0.1:8899"
pw = secrets.token_urlsafe(18)
r = httpx.post(f"{B}/api/v1/auth/signup", json={"company": "Zylker Demo", "name": "Ada Admin",
    "email": "admin@zylker.test", "password": pw, "device": {"id": "shot-1", "platform": "web", "label": "Shots"}})
r.raise_for_status(); tok = r.json()["token"]; h = {"authorization": f"Bearer {tok}"}
r = httpx.put(f"{B}/api/v1/company/smtp", headers=h, json={"host": "smtp.hostinger.com", "port": 465,
    "username": "login-demo", "password": secrets.token_urlsafe(12), "from_name": "Zylker Sales",
    "from_address": "sales@zylker.test"}); r.raise_for_status()
r = httpx.put(f"{B}/api/v1/company/gallabox", headers=h, json=CREDS); r.raise_for_status()
r = httpx.put(f"{B}/api/v1/company/gallabox/templates", headers=h,
    json={"selected": [{"name": "meeting_followup", "language": "en"}, {"name": "demo_booked", "language": "ar"}]})
r.raise_for_status()
toks = [tok]
for i in range(8):
    r = httpx.post(f"{B}/api/v1/auth/login", json={"email": "admin@zylker.test", "password": pw,
        "device": {"id": f"shot-{i+2}", "platform": "web", "label": "Shots"}})
    r.raise_for_status(); toks.append(r.json()["token"])
open(sys.argv[1], "w").write(",".join(toks))
print("seeded")
