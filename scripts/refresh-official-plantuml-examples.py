"""Refresh offline validation corpus from official example textareas (Python stdlib)."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
from datetime import date
import json
import argparse


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
            if any(source.startswith(f"@start{kind}") and f"@end{kind}" in source for kind in ["uml", "gantt", "wbs"]):
                self.examples.append(source)


root = Path(__file__).resolve().parents[1]
# Fetch and validate all requested pages before replacing any corpus.
pages = {"class": "class-diagram", "usecase": "use-case-diagram", "component": "component-diagram",
         "activity": "activity-diagram-beta", "gantt": "gantt-diagram", "wbs": "wbs-diagram", "sequence": "sequence-diagram"}
arguments = argparse.ArgumentParser(description=__doc__)
arguments.add_argument("--kinds", nargs="+", choices=pages, default=["class", "usecase"])
selected = arguments.parse_args().kinds
corpora = {}
for kind in selected:
    page = pages[kind]
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
