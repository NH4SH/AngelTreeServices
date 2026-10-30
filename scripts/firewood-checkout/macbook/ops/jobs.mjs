import {resolve} from 'node:path';
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function xml(x){if(typeof x==='boolean')return x?'<true/>':'<false/>';if(Number.isInteger(x))return `<integer>${x}</integer>`;if(typeof x==='string')return `<string>${esc(x)}</string>`;if(Array.isArray(x))return '<array>'+x.map(xml).join('')+'</array>';return '<dict>'+Object.entries(x).map(([k,v])=>`<key>${esc(k)}</key>${xml(v)}`).join('')+'</dict>';}
export const policy=Object.freeze({workerSeconds:300,monitorSeconds:60,backupSeconds:3600,watchSeconds:300});
export function jobs({root,node,code,prefix='com.angeltreeservices.firewood.qa'}){
  const run=resolve(code,'run.mjs');
  const base=role=>({Label:prefix+'.'+role,ProgramArguments:[node,run,role],WorkingDirectory:resolve(root,'app'),
    EnvironmentVariables:{HOME:resolve(root,'../../..'),PATH:'/opt/homebrew/bin:/usr/bin:/bin'},ProcessType:'Background',Umask:63,
    ThrottleInterval:30,StandardOutPath:resolve(root,'ops/logs/'+role+'.log'),StandardErrorPath:resolve(root,'ops/logs/'+role+'.log')});
  const rows=[['postgres',{...base('postgres'),ProgramArguments:[resolve(root,'postgres/bin/postgres'),'-D',resolve(root,'cluster')],KeepAlive:true,ExitTimeOut:30}],
    ['web',{...base('web'),KeepAlive:true,ExitTimeOut:30}],
    ['worker',{...base('worker'),RunAtLoad:true,StartInterval:policy.workerSeconds}],
    ['monitor',{...base('monitor'),RunAtLoad:true,StartInterval:policy.monitorSeconds}],
    ['backup',{...base('backup'),RunAtLoad:true,StartInterval:policy.backupSeconds}]];
  return rows.map(([role,value])=>({role,label:value.Label,value,plist:'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">'+xml(value)+'</plist>\n'}));
}
export function watchJob({root,node,code,config,prefix='com.angeltreeservices.firewood.qa'}){
  const value={Label:prefix+'.backup-watch',ProgramArguments:[node,resolve(code,'watch.mjs'),config],WorkingDirectory:root,
    ProcessType:'Background',Umask:63,RunAtLoad:true,StartInterval:policy.watchSeconds,
    StandardOutPath:resolve(root,'watch.log'),StandardErrorPath:resolve(root,'watch.log')};
  return {role:'backup-watch',label:value.Label,value,plist:'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">'+xml(value)+'</plist>\n'};
}
