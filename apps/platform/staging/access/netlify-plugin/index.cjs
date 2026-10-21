const {join}=require('node:path');
const {installFirstGate}=require('./transform.cjs');
module.exports={onBuild(){installFirstGate(join(__dirname,'../../..'),process.env);}};
