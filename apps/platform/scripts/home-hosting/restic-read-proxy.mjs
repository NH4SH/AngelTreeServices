// Read-only REST-backend adapter, bound to loopback and an unguessable path.
// Native Restic owns encryption, authentication, graph checks and decoding.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {randomBytes} from 'node:crypto';
export async function startResticReadProxy(inventory,read){
 const token=randomBytes(24).toString('hex'),objects=new Map(inventory.map(o=>[o.name,o]));let requests=0;
 const server=createServer(async(req,res)=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const url=new URL(req.url,'http://127.0.0.1');if(url.search||!url.pathname.startsWith('/'+token+'/')){res.writeHead(404);res.end();return;}
   const path=url.pathname.slice(token.length+2);if(++requests>4096)throw Error('REST request cap');
   if(/^(keys|index|snapshots|data|locks)\/$/.test(path)){
    const type=path.slice(0,-1),rows=inventory.filter(o=>o.name.startsWith(type+'/')).map(o=>({name:o.name.split('/').at(-1),size:o.size}));
    const bytes=Buffer.from(JSON.stringify(rows));res.writeHead(200,{'content-type':'application/vnd.x.restic.rest.v2','content-length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
   }
   if(!/^(config|(keys|index|snapshots|data)\/[a-f0-9]{64})$/.test(path)){res.writeHead(404);res.end();return;}
   const name=path.startsWith('data/')?'data/'+path.slice(5,7)+'/'+path.slice(5):path,object=objects.get(name);
   if(!object){res.writeHead(404);res.end();return;}
   if(req.method==='HEAD'){res.writeHead(200,{'content-length':object.size});res.end();return;}
   let start=0,end=object.size-1;const range=req.headers.range;
   if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);assert.ok(m);start=Number(m[1]);if(m[2])end=Number(m[2]);}
   assert.ok(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&end<object.size);
   const bytes=await read(object,start,end);assert.equal(bytes.length,end-start+1);
   res.writeHead(range?206:200,{'content-type':'application/octet-stream','content-length':bytes.length,'accept-ranges':'bytes',...(range?{'content-range':`bytes ${start}-${end}/${object.size}`}:{})});res.end(bytes);
  }catch{if(!res.headersSent)res.writeHead(507);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {repo:'rest:http://127.0.0.1:'+server.address().port+'/'+token+'/',
  async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
