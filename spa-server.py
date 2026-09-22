import http.server
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.translate_path(self.path.split("?", 1)[0])
        if not os.path.isfile(path):
            self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    http.server.HTTPServer(("localhost", 8080), SPAHandler).serve_forever()
