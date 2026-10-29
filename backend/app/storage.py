"""Object storage for documents: local directory or Google Cloud Storage.

Keys: ``templates/<uuid>.<ext>`` and ``projects/<pid>/<doc_id>/v<n>-<uuid>.<ext>``.
Legacy keys without ``/`` are old local filenames and always resolve to the local dir.
Backend via env STORAGE_BACKEND=local (default) | gcs (needs GCS_BUCKET, uses ADC).
"""

import hashlib
import os
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

LOCAL_ROOT = Path(__file__).resolve().parent.parent / "storage"
CACHE_ROOT = Path(tempfile.gettempdir()) / "icf-gcs-cache"


def template_key(ext: str) -> str:
    return f"templates/{uuid.uuid4().hex}{ext.lower()}"


def version_key(project_id: int, doc_id: int, number: int, ext: str) -> str:
    return f"projects/{project_id}/{doc_id}/v{number}-{uuid.uuid4().hex}{ext.lower()}"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class LocalStorage:
    def __init__(self, root: Path = LOCAL_ROOT) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError(f"bad key {key!r}")
        return path

    def put(self, key: str, data: bytes, content_type: str | None = None) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_file(self, key: str, path: Path | str, content_type: str | None = None) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()  # FileNotFoundError when missing

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    @contextmanager
    def local_path(self, key: str) -> Iterator[Path]:
        path = self._path(key)
        if not path.exists():
            raise FileNotFoundError(key)
        yield path


class GcsStorage:
    def __init__(self, bucket_name: str | None) -> None:
        if not bucket_name:
            raise RuntimeError("STORAGE_BACKEND=gcs requires env GCS_BUCKET (bucket name)")
        from google.cloud import storage

        self.bucket = storage.Client().bucket(bucket_name)

    def put(self, key: str, data: bytes, content_type: str | None = None) -> None:
        self.bucket.blob(key).upload_from_string(
            data, content_type=content_type or "application/octet-stream"
        )

    def put_file(self, key: str, path: Path | str, content_type: str | None = None) -> None:
        self.bucket.blob(key).upload_from_filename(
            str(path), content_type=content_type or "application/octet-stream"
        )

    def _blob(self, key: str):
        blob = self.bucket.get_blob(key)
        if blob is None:
            raise FileNotFoundError(key)
        return blob

    def get(self, key: str) -> bytes:
        return self._blob(key).download_as_bytes()

    def delete(self, key: str) -> None:
        from google.api_core.exceptions import NotFound

        try:
            self.bucket.blob(key).delete()
        except NotFound:
            pass
        shutil.rmtree(CACHE_ROOT / hashlib.sha1(key.encode()).hexdigest(), ignore_errors=True)  # noqa: S324

    @contextmanager
    def local_path(self, key: str) -> Iterator[Path]:
        blob = self._blob(key)  # one metadata call: gives generation + md5
        folder = CACHE_ROOT / hashlib.sha1(key.encode()).hexdigest()  # noqa: S324
        tag = f"{blob.generation}-{blob.md5_hash or 'x'}".replace("/", "_")
        path = folder / f"{tag}{Path(key).suffix}"
        if not path.exists():
            folder.mkdir(parents=True, exist_ok=True)
            tmp = folder / f".{uuid.uuid4().hex}.part"
            blob.download_to_filename(str(tmp))
            os.replace(tmp, path)
        yield path


_local = LocalStorage()
_backend: LocalStorage | GcsStorage | None = None


def backend() -> LocalStorage | GcsStorage:
    global _backend  # noqa: PLW0603
    if _backend is None:
        name = os.environ.get("STORAGE_BACKEND", "local").strip().lower()
        if name == "gcs":
            _backend = GcsStorage(os.environ.get("GCS_BUCKET", "").strip() or None)
        elif name == "local":
            _backend = _local
        else:
            raise RuntimeError(f"Unknown STORAGE_BACKEND {name!r} (use local or gcs)")
    return _backend


def _for(key: str) -> LocalStorage | GcsStorage:
    return _local if "/" not in key else backend()


def put(key: str, data: bytes, content_type: str | None = None) -> None:
    backend().put(key, data, content_type)


def put_file(key: str, path: Path | str, content_type: str | None = None) -> None:
    backend().put_file(key, path, content_type)


def get(key: str) -> bytes:
    return _for(key).get(key)


def delete(key: str) -> None:
    _for(key).delete(key)


def local_path(key: str):
    """Context manager yielding a real filesystem path for the object (do not modify it)."""
    return _for(key).local_path(key)
