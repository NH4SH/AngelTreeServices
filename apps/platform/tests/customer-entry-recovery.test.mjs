import assert from 'node:assert/strict';
import test from 'node:test';
import {PortalContact,CustomerDocumentEntry,entryPage,organizationPage,SetupRequired,loginPage,LoginForm,AccessStatusShell}from'./customer-entry-recovery-fixture.mjs';
import {elements,text}from'./customer-invoice-fixture.mjs';
import {renderPrintCase,expandPrintTree}from'./customer-document-print-fixture.mjs';
const inspect=view=>{const tree=expandPrintTree(view);return{nodes:elements(tree),content:text(tree)};};
function assertHelpOnly(nodes){assert.ok(nodes.some(x=>x.type==='a'&&x.props.href==='tel:+15403888715'));assert.ok(!nodes.some(x=>['form','input'].includes(x.type)));}

test('customer home retains its configuration and signed-in access requirements',async()=>{
 assert.equal((await entryPage({configured:false})() ).type,SetupRequired);
 await assert.rejects(entryPage()(),error=>error.path==='/login?next=/portal');
 const view=await entryPage({user:{email:'synthetic@example.invalid'}})();
 assert.equal(view.type,CustomerDocumentEntry);assert.equal(view.props.signedInAs,'synthetic@example.invalid');
 const {nodes,content}=inspect(view);assert.match(content,/Open your customer documents/);assert.match(content,/Signed in as\s+synthetic@example.invalid/);assertHelpOnly(nodes);
 assert.doesNotMatch(content,/billing is connected|Photo sharing|Feedback and review/);
});
test('organization destination gives useful document help and never consumes or reflects an arbitrary token',()=>{
 const capability='SYNTHETIC_CAPABILITY_PRIVATE_'+ 'x'.repeat(50);
 const {nodes,content}=inspect(organizationPage({params:Promise.resolve({token:capability})}));
 assert.match(content,/Open your property documents/);assert.match(content,/separate document link/);assertHelpOnly(nodes);
 assert.doesNotMatch(content,new RegExp(capability+'|not active yet|scoped, expiring'));
});
test('recovery uses native disclosure and office contact without auto-email, document lookup or a login requirement',()=>{
 const {nodes,content}=inspect(PortalContact({showLinkHelp:true}));assert.ok(nodes.some(x=>x.type==='details'));assert.ok(nodes.some(x=>x.type==='summary'));assert.match(content,/spam or junk/);assert.match(content,/name and service address/);assert.match(content,/do not need to sign in/);
 assert.equal(nodes.filter(x=>x.type==='a').length,1);assertHelpOnly(nodes);assert.ok(nodes.every(x=>!x.props.onClick));
 assert.ok(!inspect(PortalContact({})).nodes.some(x=>x.type==='details'));
});
test('login retains account, role and redirect behavior alongside customer help',async()=>{
 const searchParams=Promise.resolve({next:'/portal',signedOut:'true'}),view=await loginPage()({searchParams});
 const form=elements(view).find(x=>x.type===LoginForm);assert.equal(form.props.nextPath,'/portal');assert.equal(form.props.signedOut,true);assert.equal(form.props.configured,true);assert.ok(elements(view).some(x=>x.type===PortalContact&&x.props.showLinkHelp));
 assert.equal((await loginPage({user:{id:'synthetic'},userRoles:[]})({searchParams})).type,AccessStatusShell);
 for(const [role,next,expected]of [['customer','/admin','/portal'],['property_manager','/portal/organization/synthetic','/portal/organization/synthetic'],['crew','/portal','/crew'],['owner','/admin','/admin']])await assert.rejects(loginPage({user:{id:'synthetic'},userRoles:[role]})({searchParams:Promise.resolve({next})}),error=>error.path===expected);
 assert.equal(elements(await loginPage({configured:false})({searchParams})).find(x=>x.type===LoginForm).props.configured,false);
});
for(const kind of ['quote','invoice','change_order'])test(kind+' unavailable and throttled views offer help without record details or response/payment/print actions',async()=>{
 for(const options of [{lookup:false},{available:false},{allowed:false}]){
  const view=await renderPrintCase({kind,record:{customer_message:'PRIVATE_RECORD_CANARY'},rawToken:'private-token-canary'},{...options,contact:PortalContact});
  const {nodes,content}=inspect(view);assert.match(content,/link unavailable/);assert.ok(nodes.some(x=>x.type==='summary'&&text(x).includes('Can’t find or open your link?')));assertHelpOnly(nodes);assert.doesNotMatch(content,/PRIVATE_RECORD_CANARY|private-token-canary|Print or save/);assert.ok(!nodes.some(x=>x.props.className?.split(' ').includes('document-print-region')));
 }
});
