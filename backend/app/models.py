from typing import Literal

from pydantic import BaseModel, Field

Kind = Literal["sponsor", "template"]
Language = Literal["en", "nl", "fr"]
Audience = Literal["adult", "parent", "adolescent", "child"]
Preview = Literal["docx", "pdf", "none"]


class Document(BaseModel):
    id: int
    kind: Kind
    name: str
    filename: str
    language: Language | None
    audience: Audience | None
    version: str | None
    study: str | None
    size: int
    uploaded_at: str
    preview: Preview


class Heading(BaseModel):
    level: int
    text: str
    anchor: str


class Colors(BaseModel):
    purple: int
    red: int
    blue: int
    black: int


class Stats(BaseModel):
    paragraphs: int
    words: int
    tables: int
    colors: Colors


class HtmlResult(BaseModel):
    html: str
    headings: list[Heading]
    stats: Stats


class SeedItem(BaseModel):
    name: str
    kind: Literal["template", "project_doc"]


class SeedResult(BaseModel):
    imported: int
    skipped: int
    items: list[SeedItem]


class CreationJob(BaseModel):
    template_id: int
    sponsor_ids: list[int] = Field(default_factory=list)
    notes: str = ""


class TranslationJob(BaseModel):
    source_ids: list[int]
    target_languages: list[Literal["nl", "fr"]]


class UpdateJob(BaseModel):
    document_ids: list[int]
    new_template_id: int
