#!/usr/bin/env python3
"""
Wyciąga sekcję `## FAQ` z każdego wpisu i zapisuje ją we frontmatterze jako pole `faq`
w formacie JSON — dokładnie takim, jakiego oczekuje pole „FAQ (schema FAQPage)" w Payload.

Dzięki temu każdy opublikowany wpis emituje schema FAQPage (rich results + cytowania w AI),
bez ręcznego przepisywania pytań.

Uruchomienie:  python3 extract_faq.py
"""
import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

# **Pytanie?**  \n  Odpowiedź (do pustej linii lub kolejnego pytania)
QA = re.compile(r"^\*\*(.+?)\*\*\s*\n(.+?)(?=\n\s*\n|\n\*\*|\Z)", re.S | re.M)


def extract_faq(body: str):
    m = re.search(r"^##\s+FAQ\s*$(.*?)(?=^##\s|\Z)", body, re.S | re.M)
    if not m:
        return []
    out = []
    for q, a in QA.findall(m.group(1)):
        answer = " ".join(a.strip().split())
        # usuń markdown: linki [tekst](url) -> tekst, pogrubienia i kod
        answer = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", answer)
        answer = re.sub(r"\*\*(.+?)\*\*", r"\1", answer)
        answer = answer.replace("`", "")
        out.append({"q": q.strip(), "a": answer})
    return out


def main():
    updated = 0
    for path in sorted(glob.glob(os.path.join(HERE, "*.md"))):
        if os.path.basename(path).lower() == "readme.md":
            continue
        txt = open(path, encoding="utf-8").read()
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", txt, re.S)
        if not m:
            continue
        fm, body = m.group(1), m.group(2)

        faq = extract_faq(body)
        if not faq:
            print("— brak FAQ:", os.path.basename(path))
            continue

        fm_lines = [l for l in fm.splitlines() if not l.startswith("faq:")]
        fm_lines.append("faq: " + json.dumps(faq, ensure_ascii=False))
        open(path, "w", encoding="utf-8").write("---\n" + "\n".join(fm_lines) + "\n---\n" + body)
        updated += 1
        print(f"✓ {os.path.basename(path)} — {len(faq)} pytań")

    print(f"\nZaktualizowano {updated} wpisów.")


if __name__ == "__main__":
    main()
