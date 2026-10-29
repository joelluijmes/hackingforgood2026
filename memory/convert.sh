#!/bin/bash
# usage: convert.sh <bucket_dir> <out_dir>
B="$1"; O="$2"; mkdir -p "$O"
find "$B" -type f \( -iname '*.docx' -o -iname '*.doc' -o -iname '*.rtf' -o -iname '*.pdf' \) | while read -r f; do
  rel="${f#$B/}"; out="$O/${rel%.*}.txt"; mkdir -p "$(dirname "$out")"
  case "${f##*.}" in
    docx|DOCX|rtf|RTF) pandoc "$f" -t plain --wrap=none -o "$out" 2>/dev/null ;;
    doc|DOC) textutil -convert txt -stdout "$f" > "$out" 2>/dev/null ;;
    pdf) pdftotext -layout "$f" "$out" 2>/dev/null ;;
  esac
done
