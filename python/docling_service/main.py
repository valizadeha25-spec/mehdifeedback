from __future__ import annotations

import base64
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SubscriptionSync Docling Sidecar")

try:
    from docling.document_converter import DocumentConverter
except ImportError:  # pragma: no cover - docling is optional during local setup
    DocumentConverter = None


class ParseRequest(BaseModel):
    filename: str = "invoice.pdf"
    contentBase64: str


class ParseResponse(BaseModel):
    text: str


def _convert_with_docling(file_path: Path) -> str:
    if DocumentConverter is None:
        raise HTTPException(
            status_code=503,
            detail="Docling is not installed in the sidecar environment.",
        )

    converter = DocumentConverter()
    result = converter.convert(str(file_path))
    document = result.document

    if hasattr(document, "export_to_markdown"):
        return document.export_to_markdown()

    return str(document)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResponse)
def parse_invoice(request: ParseRequest) -> ParseResponse:
    try:
        pdf_bytes = base64.b64decode(request.contentBase64)
    except Exception as exc:  # pragma: no cover - defensive decoding path
        raise HTTPException(status_code=400, detail="Invalid base64 payload.") from exc

    suffix = Path(request.filename).suffix or ".pdf"
    with NamedTemporaryFile(delete=True, suffix=suffix) as temp_file:
        temp_file.write(pdf_bytes)
        temp_file.flush()
        text = _convert_with_docling(Path(temp_file.name)).strip()

    if not text:
        raise HTTPException(status_code=422, detail="Docling returned no text.")

    return ParseResponse(text=text)
