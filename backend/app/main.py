from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import Base, engine
from app.errors import ApiException
from app.routers import (
    answer_sheets,
    auth,
    lessons,
    llm,
    masters,
    problems,
    students,
    tests,
    worksheets,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="260915hackathon backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiException)
def handle_api_exception(_: Request, exc: ApiException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
def handle_validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": str(exc.errors())}},
    )


app.include_router(auth.router)
app.include_router(masters.router)
app.include_router(students.router)
app.include_router(tests.router)
app.include_router(problems.router)
app.include_router(lessons.router)
app.include_router(answer_sheets.router)
app.include_router(worksheets.router)
app.include_router(llm.router)


@app.get("/health")
def health():
    return {"status": "ok"}
