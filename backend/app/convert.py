"""Convert legacy .rtf/.doc uploads to .docx. Pluggable chain: pandoc (rtf) -> LibreOffice."""

import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

LEGACY_EXT = {".rtf", ".doc"}
SOFFICE_TIMEOUT = 90


class ConversionError(Exception):
    pass


def pandoc_available() -> bool:
    try:
        import pypandoc  # noqa: F401
    except Exception:
        return False
    return True


def soffice_path() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


def needs_conversion(filename: str) -> bool:
    return Path(filename).suffix.lower() in LEGACY_EXT


def _rtf_pandoc(data: bytes, tmp: Path) -> bytes:
    import pypandoc

    out = tmp / "pandoc.docx"
    pypandoc.convert_text(
        data.decode("utf-8", errors="replace"), "docx", format="rtf", outputfile=str(out)
    )
    return out.read_bytes()


def _libreoffice(data: bytes, filename: str, tmp: Path) -> bytes:
    exe = soffice_path()
    if not exe:
        raise ConversionError("LibreOffice (soffice) is not installed")
    src = tmp / f"in{Path(filename).suffix.lower()}"
    src.write_bytes(data)
    outdir = tmp / "out"
    outdir.mkdir()
    profile = f"file:///tmp/lo-{uuid.uuid4().hex}"
    try:
        proc = subprocess.run(  # noqa: S603
            [exe, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "docx",
             "--outdir", str(outdir), str(src)],
            capture_output=True,
            timeout=SOFFICE_TIMEOUT,
            check=False,
        )  # fmt: skip
    except subprocess.TimeoutExpired:
        raise ConversionError(f"LibreOffice timed out after {SOFFICE_TIMEOUT}s") from None
    finally:
        shutil.rmtree(profile.removeprefix("file://"), ignore_errors=True)
    out = outdir / "in.docx"
    if proc.returncode != 0 or not out.exists():
        err = proc.stderr.decode(errors="replace").strip()[:200]
        raise ConversionError(f"LibreOffice conversion failed: {err or 'no output'}")
    return out.read_bytes()


def to_docx(data: bytes, filename: str) -> tuple[bytes, str]:
    """Return (docx_bytes, '<stem>.docx'). Non-legacy files are returned unchanged."""
    ext = Path(filename).suffix.lower()
    if ext not in LEGACY_EXT:
        return data, filename
    new_name = f"{Path(filename).stem}.docx"
    errors: list[str] = []
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        if ext == ".rtf":
            try:
                return _rtf_pandoc(data, tmp), new_name
            except Exception as exc:
                errors.append(f"pandoc: {exc}")
        try:
            return _libreoffice(data, filename, tmp), new_name
        except ConversionError as exc:
            errors.append(str(exc))
    raise ConversionError("; ".join(errors))


def converted_note(filename: str) -> str:
    return f"Converted from {Path(filename).suffix.lstrip('.').upper()}"
