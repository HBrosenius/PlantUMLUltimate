"""Refresh offline validation corpus from official example textareas (Python stdlib)."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
from datetime import date
import json


class Examples(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []
        self.examples = []

    def handle_starttag(self, tag, attrs):
        if tag == "textarea":
            self.active = True
            self.parts = []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "textarea" and self.active:
            self.active = False
            source = "".join(self.parts).strip()
            if source.startswith("@startuml") and "@enduml" in source:
                self.examples.append(source)


root = Path(__file__).resolve().parents[1]
# Fetch and validate both pages before replacing either corpus.
corpora = {}
for kind, page in [("class", "class-diagram"), ("usecase", "use-case-diagram")]:
    url = f"https://plantuml.com/{page}"
    parser = Examples()
    with urlopen(url, timeout=30) as response:
        parser.feed(response.read().decode("utf-8"))
    examples = list(dict.fromkeys(parser.examples))
    if not examples:
        raise RuntimeError(f"No examples found at {url}; check page structure")
    corpora[kind] = dict(url=url, retrieved=date.today().isoformat(), examples=examples)
for kind, corpus in corpora.items():
    target = root / "tests" / "fixtures" / "official-plantuml" / f"{kind}.json"
    target.write_text(json.dumps(corpus, indent=2, ensure_ascii=False) + "\n")
    print(f"{kind}: {len(corpus['examples'])} examples")
