"""Local preview server with an opt-in endpoint for saving a browser recording."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        url = urlparse(self.path)
        extension = parse_qs(url.query).get("ext", [""])[0]
        if url.path != "/save-video" or extension not in ("mp4", "webm"):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length < 250_000_000:
            self.send_error(413)
            return
        destination = ROOT / f"plantuml-ultimate-film.{extension}"
        destination.write_bytes(self.rfile.read(length))
        self.send_response(201)
        self.end_headers()
        self.wfile.write(str(destination).encode())


if __name__ == "__main__":
    print("Preview: http://127.0.0.1:8765")
    ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
