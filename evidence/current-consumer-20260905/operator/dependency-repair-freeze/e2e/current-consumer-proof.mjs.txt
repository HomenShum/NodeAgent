import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer as createPortProbe } from 'node:net';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// The supplied app must be the retained output of the installed package CLI.
// The actual adapter iterator is held in browser memory only to settle running-frame captures.
const source = path.resolve(import.meta.dirname, '..');
const consumer = path.resolve(process.argv[2] ?? '');
const evidence = path.resolve(process.argv[3] ?? '');
assert.ok(process.argv[2] && process.argv[3], 'Provide generated consumer path and NEW evidence directory');
await mkdir(evidence, { recursive:false });
const sha = value => createHash('sha256').update(value).digest('hex');
const tracked = execFileSync('git',['ls-files','-z'],{cwd:source,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).toString().split('\0').filter(Boolean).filter(file=>!path.basename(file).startsWith('.env'));
tracked.push('e2e/current-consumer-proof.mjs','examples/apps/chat-ui/template/package-lock.json');
const sourceHashes = async () => Object.fromEntries(await Promise.all(tracked.map(async file=>[file,sha(await readFile(path.join(source,file)))])));
const consumerFiles=['package.json','package-lock.json','index.html','vite.config.mjs','src/main.jsx','src/styles.css','src/nodeagent-chat/NodeAgentChatApp.jsx','src/nodeagent-chat/nodeAgentLocalAdapter.js','src/nodeagent-chat/toolUIs.jsx'];
const consumerHashes = async () => Object.fromEntries(await Promise.all(consumerFiles.map(async file=>[file,sha(await readFile(path.join(consumer,file)))])));
const report={namedProof:'NODEAGENT-CURRENT-CONSUMER-01',passed:false,startedAt:new Date().toISOString(),sourceBefore:await sourceHashes(),consumerBefore:await consumerHashes(),checks:[],captures:[],observations:[],console:[],requests:[],providerCalls:0,grade:null};
const check=(value,name)=>{report.checks.push({name,passed:Boolean(value)});assert.ok(value,name);};
let browser,page;const servers=[];
async function server(root){
  const probe=createPortProbe(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve)); const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const app=await createServer({root,envDir:false,server:{host:'127.0.0.1',port,strictPort:true,open:false}}); await app.listen(); servers.push(app);
  return 'http://127.0.0.1:'+port;
}
async function context(base,width){
  const ctx=await browser.newContext({viewport:{width,height:width<=390?844:960},colorScheme:'light'});
  await ctx.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(report.requests.length<500)report.requests.push({origin:url.origin,path:url.pathname,method:request.method()});if(url.origin!==base&&!['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.abort();return route.continue();});
  page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>report.console.push({type:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error'&&report.console.length<100)report.console.push({type:'console',message:message.text()});});await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('textarea[name="input"]').waitFor();await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3000))]));return ctx;
}
async function capture(name){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  let prior=await page.content();for(let i=0;i<8;i++){await page.waitForTimeout(250);const now=await page.content();if(now===prior)break;prior=now;}const html=await page.content();const state=await page.evaluate(()=>({url:location.href,viewport:{width:innerWidth,height:innerHeight},focused:document.activeElement?.tagName,overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label')??e.textContent,disabled:e.disabled})),bodyText:document.body.innerText.slice(-6000)}));
  await page.screenshot({path:path.join(evidence,name+'.png'),caret:'initial'});check(await page.content()===html,name+' screenshot restores exact DOM');await writeFile(path.join(evidence,name+'.html'),html);await writeFile(path.join(evidence,name+'.json'),JSON.stringify(state,null,2)+'\n');report.captures.push({name,state,pngSha256:sha(await readFile(path.join(evidence,name+'.png')))});return state;
}
async function holdActualRunningFrame(base){
  await page.evaluate(async()=>{const module=await import('/src/nodeagent-chat/nodeAgentLocalAdapter.js'),original=module.nodeAgentLocalAdapter.run;module.nodeAgentLocalAdapter.run=async function*(args){module.nodeAgentLocalAdapter.run=original;window.proofRunCompleted=false;let held=false;for await(const frame of original(args)){yield frame;if(!held&&frame.content.some(p=>p.type==='tool-call'&&!p.result)){held=true;window.proofHeldText=frame.content.find(p=>p.type==='text').text;await new Promise(resolve=>window.proofRelease=resolve);}}window.proofRunCompleted=true;};});
  report.observations.push({name:'actual-running-frame-hold',purpose:'The actual adapter iterator waits after its first actual running tool frame solely to settle the screenshot; no DOM/result/source substitution.'});
}
async function send(text){await page.locator('textarea[name="input"]').fill(text);await page.waitForFunction(()=>document.querySelector('button[aria-label="Send"]')?.disabled===false);await page.locator('textarea[name="input"]').press('Enter');}
async function complete(generated,count=1){await page.waitForFunction(({generated,count})=>{const cards=document.querySelectorAll(generated?'.naTool':'.na-tool');return cards.length===4*count&&[...cards].every(e=>e.getAttribute('data-running')!=='true')&&document.body.innerText.includes('Done.');},{generated,count});}
try {
  const generatedBase=await server(consumer);browser=await chromium.launch({headless:true});report.browser=browser.version();report.node=process.version;
  for(const width of [320,390,768,1024,1440,1920]){
    const ctx=await context(generatedBase,width);check(await page.locator('[data-nodeagent-chat="empty"]').isVisible(),'generated empty state '+width);await capture('generated-empty-'+width);
    await holdActualRunningFrame(generatedBase);await page.locator('textarea[name="input"]').fill('PROOF FIXTURE: Does the local no-key MVP path work? Preserve unknown provider capability.');if([320,768,1440].includes(width))await page.getByRole('button',{name:'Send',exact:true}).click();else await page.locator('textarea[name="input"]').press('Enter');await page.locator('.naTool[data-running="true"]').first().waitFor();
    await page.waitForFunction(()=>typeof window.proofRelease==='function'&&document.body.innerText.includes(window.proofHeldText));const running=await capture('generated-running-'+width);check(running.overflow<=1,'generated running reflows '+width);report.observations.push({name:'generated-D3-'+width,hasStop:running.buttons.some(b=>/stop|cancel/i.test(b.label??'')),sendDisabled:running.buttons.find(b=>b.label==='Send')?.disabled});
    // A second immediate Enter cannot add a concurrent model/fixture run.
    await page.locator('textarea[name="input"]').press('Enter');await page.evaluate(()=>window.proofRelease());await complete(true);await page.waitForFunction(()=>window.proofRunCompleted===true);check(await page.locator('.naTool').count()===4,'burst Enter retains one four-card run '+width);await capture('generated-populated-'+width);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('textarea[name="input"]').waitFor();check(await page.locator('.naTool').count()===0&&await page.locator('[data-nodeagent-chat="empty"]').isVisible(),'reload resets only browser session '+width);await capture('generated-reloaded-'+width);await ctx.close();
  }
  const sustained=await context(generatedBase,390),began=Date.now();for(let i=0;i<8;i++){await send('PROOF FIXTURE repeat '+(i+1)+': inspect the same local adoption evidence.');await complete(true,i+1);check(await page.locator('.naTool').count()===4*(i+1),'sustained accumulated four-card run '+(i+1));}report.sustained={turns:8,toolCards:32,elapsedMs:Date.now()-began};await capture('generated-sustained-390');await sustained.close();
  check(report.requests.every(r=>r.method==='GET'),'browser made no writes or provider requests');report.sourceAfter=await sourceHashes();report.consumerAfter=await consumerHashes();assert.deepEqual(report.sourceAfter,report.sourceBefore);assert.deepEqual(report.consumerAfter,report.consumerBefore);check(true,'source and installed generated input bytes unchanged');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page&&!page.isClosed()){await writeFile(path.join(evidence,'failure.html'),await page.content());await page.screenshot({path:path.join(evidence,'failure.png'),caret:'initial'}).catch(()=>{});}
}finally{await browser?.close();for(const app of servers)await app.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({evidence,passed:report.passed,checks:report.checks.length,captures:report.captures.length,error:report.error}));}
