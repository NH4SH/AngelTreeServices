#!/usr/bin/env python3
"""Loopback-only analytics simulation. Never loads Google or permits form/network sends.

Runs two servers: an inert mock and an unmodified shipping-gates control.
Only the mock's in-memory response enables the fake G-MOCKONLY ID and replaces
the tag URL with a local empty script. No source/build file is rewritten.
"""
import argparse
import base64
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ["/", "/services/", "/services/tree-removal/", "/services/tree-pruning/",
          "/services/stump-grinding/", "/services/emergency-tree-service/",
          "/services/landscaping/", "/services/commercial-hoa-tree-care/",
          "/credentials-safety/", "/projects/", "/projects/hollow-tree-removal/", "/projects/bush-trimming-mulch/",
          "/about/", "/recognition/", "/privacy/", "/privacy-request/"]
SAFETY = b"""document.addEventListener('click',function(e){
 var a=e.target.closest&&e.target.closest('a');if(!a)return;
 var u=new URL(a.href,location.origin);
 if(u.origin!==location.origin||(u.pathname==='/'&&u.hash==='#contact'))e.preventDefault();
},true);
document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);
"""
STORE = b'''<!doctype html><meta charset="utf-8"><title>Local QA screenshot store</title>
<form method="post"><label>Capture name <input name="name"></label>
<label>JPEG base64 <textarea name="image"></textarea></label><button>Save local screenshot</button></form>'''


def dashboard(mock):
    label = "INERT LOCAL MOCK" if mock else "UNCHANGED SHIPPING GATES"
    options = "".join(f'<option value="{route}">{route}</option>' for route in ROUTES)
    return ('''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Local analytics verification</title>
<style>body{margin:0;font:16px system-ui;color:#163f19;background:#f6fbf2}main{padding:16px}
h1{font-size:22px;margin:0 0 8px}p{margin:8px 0}button,select{font:inherit;padding:10px;margin:4px}
iframe{width:100%;height:650px;border:1px solid #466541;background:white}pre{white-space:pre-wrap;
overflow-wrap:anywhere;background:white;padding:12px}label{display:inline-block;max-width:100%}select{max-width:100%}iframe{box-sizing:border-box}</style>
<main><h1>Local analytics verification — LABEL</h1>
<p>No Google collection. No calls, form submissions, or external requests. Controls simulate consent only.</p>
<label>Page <select id="route">OPTIONS</select></label><button id="open">Open page</button>
<button id="allow">Allow mock analytics</button><button id="deny">Reject / withdraw</button>
<button id="refresh">Refresh event log</button><p id="state" role="status">Consent starts denied.</p>
<iframe title="Public website test page" id="preview" src="/?qa_private_marker=DO_NOT_SEND#about"
sandbox="allow-scripts allow-same-origin"></iframe>
<h2>Local command log</h2><pre id="log">[]</pre></main>
<script>
var frame=document.getElementById('preview');
function render(){try{var layer=frame.contentWindow.dataLayer||[];
 document.getElementById('log').textContent=JSON.stringify(Array.from(layer,function(x){return Array.from(x)}),null,2);
}catch(e){document.getElementById('log').textContent='Test page not ready';}}
document.getElementById('open').onclick=function(){frame.src=document.getElementById('route').value+'?qa_private_marker=DO_NOT_SEND';document.getElementById('state').textContent='New document; consent starts denied.';};
document.getElementById('allow').onclick=function(){frame.contentWindow.ATSWebsite.setConsent('granted');document.getElementById('state').textContent='Mock consent granted; shipping collection remains disabled.';render();};
document.getElementById('deny').onclick=function(){frame.contentWindow.ATSWebsite.setConsent('denied');document.getElementById('state').textContent='Mock consent denied; later clicks are not recorded.';render();};
document.getElementById('refresh').onclick=render;frame.onload=render;setInterval(render,250);
</script></html>'''.replace("LABEL", label).replace("OPTIONS", options)).encode()


def handler_factory(mock, evidence_dir):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / "dist-public"), **kwargs)

        def log_message(self, *args):
            pass

        def end_headers(self):
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
            super().end_headers()

        def respond(self, body, content_type):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/__qa__/":
                self.respond(dashboard(mock), "text/html; charset=utf-8")
            elif path == "/__qa__/tag.js":
                self.respond(b"/* INERT LOCAL STUB: no Google library, cookies, or network. */", "text/javascript")
            elif path == "/__qa__/safety.js":
                self.respond(SAFETY, "text/javascript")
            elif path == "/__qa__/fixtures":
                suffix = "MOCKONLY" if mock else "8WMD200TXP"
                self.respond(('''<!doctype html><meta charset="utf-8"><title>Local consent fixtures</title>
<h1>Local consent fixtures — synthetic values only</h1>
<button id="cookies">Seed synthetic cookies</button><button id="reset">Reset analytics choice</button>
<button id="clear">Clear synthetic fixtures</button><button id="expired">Seed expired opt-in</button><button id="inspect">Inspect local fixture state</button>
<a href="/services/landscaping/">Open Landscaping</a><a href="/privacy/">Open privacy</a>
<pre id="result"></pre><script>
function report(){document.getElementById('result').textContent=JSON.stringify({cookieNames:document.cookie.split(';').map(function(c){return c.trim().split('=')[0];}).filter(function(n){return /^(_ga(?:_MOCKONLY|_8WMD200TXP|_OTHER)?|unrelated_qa)$/.test(n);}),choice:localStorage.getItem('ats-analytics-choice-v1')},null,2);}
document.getElementById('cookies').onclick=function(){['_ga','_ga_SUFFIX','_ga_OTHER','unrelated_qa'].forEach(function(k){document.cookie=k+'=SYNTHETIC; path=/; SameSite=Lax';});report();};
document.getElementById('reset').onclick=function(){localStorage.removeItem('ats-analytics-choice-v1');report();};
document.getElementById('expired').onclick=function(){localStorage.setItem('ats-analytics-choice-v1',JSON.stringify({version:1,value:'granted',at:Date.now()-181*86400000}));report();};
document.getElementById('clear').onclick=function(){document.cookie.split(';').forEach(function(c){var v=c.trim().split('=');if(/^(_ga(?:_MOCKONLY|_8WMD200TXP|_OTHER)?|unrelated_qa)$/.test(v[0])&&v[1]==='SYNTHETIC')document.cookie=v[0]+'=; Max-Age=0; path=/; SameSite=Lax';});localStorage.removeItem('ats-analytics-choice-v1');report();};document.getElementById('inspect').onclick=report;report();</script>'''.replace("SUFFIX", suffix)).encode(), "text/html; charset=utf-8")
            elif path == "/__qa__/evidence":
                self.respond(STORE, "text/html; charset=utf-8")
            elif path == "/ats-website.js":
                source = (ROOT / "dist-public/ats-website.js").read_text()
                source, n = re.subn(r"var COLLECTION_ENABLED = (?:true|false);", "var COLLECTION_ENABLED = " + ("true" if mock else "false") + ";", source)
                assert n == 1
                source, n = re.subn(r'var MEASUREMENT_ID = "[^"]*";', 'var MEASUREMENT_ID = "' + ("G-MOCKONLY" if mock else "") + '";', source)
                assert n == 1
                source = source.replace("https://www.googletagmanager.com/gtag/js?id=", "/__qa__/tag.js?id=")
                self.respond(source.encode(), "text/javascript")
            elif path in ROUTES:
                file = ROOT / "dist-public" / path.lstrip("/") / "index.html"
                source = file.read_text().replace("</body>", '<script src="/__qa__/safety.js"></script></body>')
                self.respond(source.encode(), "text/html; charset=utf-8")
            else:
                super().do_GET()

        def do_POST(self):
            # Only screenshot storage is accepted; no form/intake/collect endpoint exists.
            if urlsplit(self.path).path != "/__qa__/evidence" or self.headers.get("Origin") != f"http://127.0.0.1:{self.server.server_port}":
                self.send_error(405)
                return
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size < 2_000_000:
                self.send_error(400)
                return
            data = parse_qs(self.rfile.read(size).decode())
            name = data.get("name", [""])[0]
            if name not in {"analytics-mock-desktop", "analytics-mock-mobile", "shipping-control", "consent-desktop", "consent-mobile", "consent-disabled", "consent-privacy", "analytics-live-local", "analytics-live-mobile", "analytics-live-production", "tag-detection", "tag-user-data", "tag-quality", "stream-measurement", "ga-data-collection", "ga-retention", "ga-debugview", "netlify-live"}:
                self.send_error(400)
                return
            raw = base64.b64decode(data["image"][0], validate=True)
            if not raw.startswith(b"\xff\xd8"):
                self.send_error(400)
                return
            evidence_dir.mkdir(parents=True, exist_ok=True)
            target = evidence_dir / (name + ".jpg")
            target.write_bytes(raw)
            self.respond(json.dumps({"saved": str(target), "bytes": len(raw)}).encode(), "application/json")

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    args = parser.parse_args()
    assert (ROOT / "dist-public/index.html").is_file(), "Run npm run build:public first"
    servers = []
    for label, mock in [("mock", True), ("shipping_control", False)]:
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler_factory(mock, args.evidence_dir))
        Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        print(json.dumps({label: f"http://127.0.0.1:{server.server_port}/__qa__/"}), flush=True)
    try:
        Event().wait()
    except KeyboardInterrupt:
        for server in servers:
            server.shutdown()


if __name__ == "__main__":
    main()
