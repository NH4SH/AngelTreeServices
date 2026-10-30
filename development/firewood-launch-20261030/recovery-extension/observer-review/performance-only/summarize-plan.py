#!/usr/bin/env python3
"""Summarize Root's privately captured EXPLAIN JSON. Never contacts a database."""
from pathlib import Path
import argparse, collections, hashlib, json, re

def summarize(plan):
    assert isinstance(plan,list)and len(plan)==1 and isinstance(plan[0],dict)
    result=collections.Counter()
    expensive=[]
    def walk(node,depth=0):
        assert depth<=100 and isinstance(node,dict)
        kind=node.get('Node Type')
        assert isinstance(kind,str)and re.fullmatch('[A-Za-z ]{1,80}',kind)
        result[kind]+=1
        name=node.get('Subplan Name')
        if name is not None:assert isinstance(name,str)and re.fullmatch('[A-Za-z0-9_$ ()-]{1,100}',name)
        cost=node.get('Total Cost',0)
        assert isinstance(cost,(int,float))and cost>=0
        expensive.append({'nodeType':kind,'subplan':name,'totalCost':cost,'planRows':node.get('Plan Rows'),
                          'planWidth':node.get('Plan Width'),'depth':depth})
        for child in node.get('Plans',[]):walk(child,depth+1)
    walk(plan[0]['Plan'])
    jit=plan[0].get('JIT',{})
    safe_jit={'functions':jit.get('Functions'),'options':jit.get('Options')}
    if safe_jit['options']is not None:
        assert isinstance(safe_jit['options'],dict)and all(isinstance(v,bool)for v in safe_jit['options'].values())
    return {'scope':'Planner estimates only; no actual execution timing or attestation',
            'nodeCounts':dict(result),'mostExpensiveEstimatedNodes':sorted(expensive,key=lambda n:n['totalCost'],reverse=True)[:25],
            'jit':safe_jit,'filtersOutputsConditionsAndValuesOmitted':True,'productionAdmission':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('private_plan',type=Path);args=p.parse_args()
    raw=args.private_plan.read_bytes();data=json.loads(raw)
    summary=summarize(data);summary['inputSha256']=hashlib.sha256(raw).hexdigest()
    print(json.dumps(summary,indent=2))
