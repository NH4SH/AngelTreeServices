#!/usr/bin/env python3
"""Explicitly authorized real-Google delivery QA; never submits an estimate.

Separate from the inert default QA tool. Requires --allow-google. Serves only the
built public artifact on loopback; source stays unchanged. Instrumentation logs
bounded event names/paths and booleans only, never raw requests or identifiers.
"""
import argparse
import importlib.util
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("inert_qa", Path(__file__).with_name("qa-public-analytics.py"))
QA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QA)
PROOF = r'''(function(){
'use strict';
var rows=[];
var paths=['/','/services/','/services/tree-removal/','/services/tree-pruning/','/services/stump-grinding/','/services/emergency-tree-service/','/services/commercial-hoa-tree-care/','/services/landscaping/','/credentials-safety/','/projects/','/projects/hollow-tree-removal/','/about/','/recognition/','/privacy/','/privacy-request/'];
function render(){var output=document.getElementById('qa-live-result');if(!output)return;
 var names=document.cookie.split(';').map(function(c){return c.trim().split('=')[0];});
 output.textContent=JSON.stringify({realGoogleAllowed:true,formsBlocked:true,collectionAttempts:rows,publicAnalyticsCookiesPresent:names.some(function(n){return n==='_ga'||n==='_ga_8WMD200TXP';})},null,2);
}
function record(target,body,transport,status){
 var u;try{u=new URL(String(target),location.href);}catch(e){return;}
 if(!/^(www|region1|region2)\.google-analytics\.com$/.test(u.hostname)||u.pathname!=='/g/collect')return;
 if(body&&typeof body.text==='function'){body.text().then(function(s){record(target,s,transport,status);});return;}
 var raw=typeof body==='string'?body:'';
 (raw?raw.split('\n'):['']).forEach(function(line){
  var p=new URLSearchParams(u.search);new URLSearchParams(line).forEach(function(v,k){p.set(k,v);});
  var event=p.get('en');if(!event)return;
  var dl;try{dl=new URL(p.get('dl')||'https://angeltreeservices.org/other/');}catch(e){dl=new URL('https://angeltreeservices.org/other/');}
  var path=paths.indexOf(dl.pathname)!==-1?dl.pathname:'[unexpected]';
  var loc=p.get('ep.location')||'';
  rows.push({event:['page_view','phone_link_click','estimate_cta_click','first_visit','session_start','user_engagement'].indexOf(event)!==-1?event:'[unexpected]',path:path,
    pageHasQuery:!!dl.search,pageHasFragment:!!dl.hash,titleMatchesPath:p.get('dt')===dl.pathname,
    referrerEmpty:!p.get('dr'),location:['','hero','contact','mobile_actions','site'].indexOf(loc)!==-1?loc:'[unexpected]',
    expectedProperty:p.get('tid')==='G-8WMD200TXP',debugMode:['1','true'].indexOf(p.get('_dbg'))!==-1||['1','true'].indexOf(p.get('ep.debug_mode'))!==-1||p.get('epn.debug_mode')==='1',
    canaryLeaked:/DO_NOT_SEND|qa_private_marker/.test(u.search+'\n'+raw),
    contactDataParameterPresent:Array.from(p.keys()).some(function(k){return /^(em|ph|fn|ln|street|user_data|ep\.user_data)(\.|$)/.test(k);}),
    transport:transport,status:status});
 });render();
}
if(navigator.sendBeacon){var beacon=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(url,body){var accepted=beacon(url,body);record(url,body,'beacon',accepted?'queued':'rejected');return accepted;};}
if(window.fetch){var realFetch=window.fetch.bind(window);window.fetch=function(input,init){var url=typeof input==='string'?input:(input.url||String(input));return realFetch(input,init).then(function(r){record(url,init&&init.body,'fetch',r.status);return r;},function(e){record(url,init&&init.body,'fetch','failed');throw e;});};}
document.addEventListener('DOMContentLoaded',function(){
 var section=document.createElement('section');section.setAttribute('aria-label','Authorized analytics delivery test');
 section.style.cssText='padding:20px;background:white;color:#163f19;font:16px/1.5 system-ui;overflow-wrap:anywhere';
 section.innerHTML='<h2>Authorized Google delivery test</h2><p>Local QA only. No form submission or call is permitted. Values shown below are bounded labels and booleans.</p><button type="button" id="qa-live-refresh">Refresh transport status</button><pre id="qa-live-result" style="white-space:pre-wrap"></pre>';
 document.body.appendChild(section);document.getElementById('qa-live-refresh').onclick=render;setInterval(render,500);render();
});
})();
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-google", action="store_true", required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    args = parser.parse_args()
    base = QA.handler_factory(False, args.evidence_dir)

    class Handler(base):
        def end_headers(self):
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.google-analytics.com https://region1.google-analytics.com https://region2.google-analytics.com; font-src 'self'; connect-src https://www.google-analytics.com/g/collect https://region1.google-analytics.com/g/collect https://region2.google-analytics.com/g/collect; form-action 'self'; object-src 'none'; base-uri 'none'")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
            self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
            SimpleHTTPRequestHandler.end_headers(self)

        def do_GET(self):
            path = QA.urlsplit(self.path).path
            if path == "/__qa__/live-proof.js":
                self.respond(PROOF.encode() + QA.SAFETY, "text/javascript")
            elif path == "/ats-website.js":
                source = (QA.ROOT / "dist-public/ats-website.js").read_text()
                assert "var COLLECTION_ENABLED = true;" in source
                assert 'var MEASUREMENT_ID = "G-8WMD200TXP";' in source
                source = source.replace("send_page_view: false,", 'send_page_view: false, debug_mode: true, qa_check: "launch",', 1)
                self.respond(source.encode(), "text/javascript")
            elif path in QA.ROUTES:
                source = (QA.ROOT / "dist-public" / path.lstrip("/") / "index.html").read_text()
                source = source.replace("<head>", '<head><script src="/__qa__/live-proof.js"></script>', 1)
                self.respond(source.encode(), "text/html; charset=utf-8")
            else:
                super().do_GET()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"http://127.0.0.1:{server.server_port}/services/landscaping/?qa_private_marker=DO_NOT_SEND", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
