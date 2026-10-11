import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("SEED", "1")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.code_runner import run_hidden_tests


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def login(client, email, password="demo1234"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_shortlist_hides_contacts_and_keeps_empty_fsp(client):
    token = login(client, "marina@example.com")
    needs = client.get("/api/v1/needs", headers=auth(token)).json()
    need = next(item for item in needs if item["demo_code"] == "be-middle-go")
    rows = client.get(f"/api/v1/needs/{need['id']}/shortlist", headers=auth(token)).json()
    emails = [row.get("email") for row in rows]
    names = [row["first_name"] for row in rows]
    assert "Игорь" in names
    assert "Анна" not in names
    assert all(email is None for email in emails)
    assert "igor@example.com" not in client.get(f"/api/v1/needs/{need['id']}/shortlist", headers=auth(token)).text
    igor = next(row for row in rows if row["first_name"] == "Игорь")
    assert igor["fsp_empty"] is True
    assert igor["contacts_locked"] is True
    assert igor["explanation"]
    only_fsp = client.get(f"/api/v1/needs/{need['id']}/shortlist?fsp_only=true", headers=auth(token)).json()
    assert all(not row["fsp_empty"] for row in only_fsp)
    assert all(row["first_name"] != "Игорь" for row in only_fsp)


def test_salary_required_and_contact_opens_after_accept(client):
    marina = login(client, "marina@example.com")
    needs = client.get("/api/v1/needs", headers=auth(marina)).json()
    need = next(item for item in needs if item["demo_code"] == "be-middle-go")
    rows = client.get(f"/api/v1/needs/{need['id']}/shortlist", headers=auth(marina)).json()
    igor = next(row for row in rows if row["first_name"] == "Игорь")
    missing = client.post(
        "/api/v1/invitations",
        headers=auth(marina),
        json={"candidate_id": igor["id"], "body": "Приходите в платежи", "contact_channel": "@marina"},
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "SALARY_REQUIRED"
    created = client.post(
        "/api/v1/invitations",
        headers=auth(marina),
        json={"candidate_id": igor["id"], "need_id": need["id"]},
    )
    assert created.status_code == 201, created.text
    igor_token = login(client, "igor@example.com")
    invites = client.get("/api/v1/me/invitations", headers=auth(igor_token)).json()
    assert invites[0]["salary_min"] == need["salary_min"]
    assert invites[0]["salary_max"] == need["salary_max"]
    assert invites[0]["contact_channel"] == "marina@example.com"
    assert invites[0]["status"] == "viewed"
    accepted = client.post(f"/api/v1/me/invitations/{invites[0]['id']}/accept", headers=auth(igor_token))
    assert accepted.status_code == 200
    employer_invites = client.get("/api/v1/invitations", headers=auth(marina)).json()
    opened = next(item for item in employer_invites if item["candidate"] and item["candidate"]["first_name"] == "Игорь")
    assert opened["candidate"]["email"] == "igor@example.com"
    assert opened["candidate"]["contacts_locked"] is False


def test_failed_test_does_not_assign_grade_and_form_stays_comparable(client):
    token = login(client, "anna@example.com")
    me = client.get("/api/v1/me", headers=auth(token)).json()
    assert me["grade"] is None
    assert me["fsp_empty"] is False
    started = client.post(
        "/api/v1/assessments/sessions",
        headers=auth(token),
        json={"specialization_code": "backend", "claimed_grade": "middle", "purpose": "initial"},
    )
    assert started.status_code == 201, started.text
    body = started.json()
    assert body["duration_minutes"] == 60
    theory = [item for item in body["items"] if item["section"] == "theory"]
    practice = [item for item in body["items"] if item["section"] == "practice"]
    assert len(theory) == 60
    assert len(practice) == 3
    grades = {}
    for item in theory:
        grades[item["grade"]] = grades.get(item["grade"], 0) + 1
    assert grades.get("middle") == 42
    assert grades.get("junior") == 12
    assert grades.get("senior") == 6
    assert sum(1 for item in theory if item["soft"]) == 6
    assert "answer" not in theory[0]
    for item in practice:
        assert len(item["public_tests"]) == 5
        assert item["hidden_count"] == 15
        assert "hidden" not in item
    sample = practice[0]
    ran = client.post(
        f"/api/v1/assessments/sessions/{body['id']}/run",
        headers=auth(token),
        json={"item_id": sample["id"], "source": "def solve(\n", "language": "python3.12"},
    )
    assert ran.status_code == 200, ran.text
    payload = ran.json()
    assert payload["syntax"]["line"] >= 1
    assert payload["cases"] == []
    assert payload["hidden_count"] == 15
    submitted = client.post(
        f"/api/v1/assessments/sessions/{body['id']}/submit",
        headers=auth(token),
        json={"answers": []},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["outcome"] == "fail"
    again = client.get("/api/v1/me", headers=auth(token)).json()
    assert again["grade"] is None


def test_validation_thresholds(client):
    token = login(client, "admin@example.com")
    report = client.get("/api/v1/admin/validation/summary", headers=auth(token)).json()
    assert report["precision_at_5"] >= 0.6
    assert report["irrelevant_in_top"] <= 0.1


def test_code_runner_scores_hidden_tests():
    source = "def solve(nums, threshold):\n    return sum(1 for item in nums if item > threshold)\n"
    hidden = [
        {"args": [[1, 2, 3], 0], "expected": 3},
        {"args": [[], 1], "expected": 0},
        {"args": [[4, 4], 4], "expected": 0},
    ]
    assert run_hidden_tests(source, "python", hidden) == [True, True, True]
    assert run_hidden_tests("def solve(nums, threshold):\n    return 0\n", "python", hidden)[0] is False


def test_register_requires_consents(client):
    denied = client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "demo1234", "role": "candidate", "consents": ["personal_data"]},
    )
    assert denied.status_code == 422
    assert denied.json()["error"]["code"] == "CONSENT_REQUIRED"
