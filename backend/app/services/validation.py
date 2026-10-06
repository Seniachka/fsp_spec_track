"""Отчёт по золотым меткам. Метки лежат в сиде и не вычисляются формулой fit."""

from sqlalchemy.orm import Session

from app.models import GoldLabel, Need, User
from app.services.matching import rank_need


def matching_report(db: Session) -> dict:
    labels = {(row.need_code, row.email): row.label for row in db.query(GoldLabel).all()}
    emails = {user.id: user.email for user in db.query(User).all()}
    details = []
    precisions = []
    irrelevants = []
    for need in db.query(Need).filter(Need.demo_code.is_not(None)).all():
        ranked = rank_need(db, need)
        top = ranked[:5]
        if not top:
            continue
        judged = [labels.get((need.demo_code, emails.get(row["profile"].user_id, "")), 0) for row in top]
        precision = sum(1 for value in judged if value == 2) / len(top)
        irrelevant = sum(1 for value in judged if value == 0) / len(top)
        precisions.append(precision)
        irrelevants.append(irrelevant)
        details.append(
            {
                "need": need.demo_code,
                "precision_at_5": round(precision, 3),
                "irrelevant_share": round(irrelevant, 3),
                "top": [
                    {"email": emails.get(row["profile"].user_id), "label": label, "fit": row["fit"]}
                    for row, label in zip(top, judged)
                ],
            }
        )
    db.commit()
    return {
        "precision_at_5": round(sum(precisions) / len(precisions), 3) if precisions else None,
        "irrelevant_in_top": round(sum(irrelevants) / len(irrelevants), 3) if irrelevants else None,
        "needs": details,
        "note": "Если в выдаче меньше пяти человек, знаменатель — фактическая длина топа.",
    }
