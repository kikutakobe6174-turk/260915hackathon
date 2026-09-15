from fastapi import HTTPException


class ApiException(HTTPException):
    """フロントエンドの ApiError 形状 {"error": {"code", "message"}} で返す例外。"""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


def not_found(entity: str) -> ApiException:
    return ApiException(404, "NOT_FOUND", f"{entity}が見つかりません")
