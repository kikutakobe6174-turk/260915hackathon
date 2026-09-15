from fastapi import APIRouter, Depends
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_db
from app.errors import ApiException

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.login_id == body.login_id).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise ApiException(401, "INVALID_CREDENTIALS", "ログインIDまたはパスワードが違います")
    return schemas.LoginResponse(
        user=schemas.LoginResponseUser(id=user.id, name=user.name, role=user.role)
    )
