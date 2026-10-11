import json
import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["SEED"] = "1"

from fastapi.testclient import TestClient

from app.main import app

with TestClient(app) as client:
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "demo1234"},
    ).json()["access_token"]
    report = client.get(
        "/api/v1/admin/validation/summary",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    print(json.dumps(report, ensure_ascii=False, indent=2))
