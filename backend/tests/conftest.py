import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["SEED"] = "1"
os.environ["AUTO_VERIFY"] = "1"
