import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const [rootArg,outArg]=process.argv.slice(2); assert(rootArg&&outArg);
const root=path.resolve(rootArg), output=path.resolve(outArg);
await fs.mkdir(output,{recursive:false});
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['src/app/styles.css','src/features/node-agent/components/NodeAgentDemoApp.tsx','src/features/node-agent/components/NodeAgentThread.tsx','src/features/node-agent/runtime/nodeAgentChatAdapter.ts','package.json','package-lock.json','.tours/03-debug-and-recovery.tour','docs/codebase/TESTING.md','e2e/header-reflow-proof.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));
const git=(...a)=>execFileSync('git',['--no-optional-locks',...a],{cwd:root});
const snapshot=()=>({head:git('rev-parse','HEAD').toString().trim(),index:sha(git('ls-files','--stage','-z')),refs:sha(git('show-ref')),status:sha(git('status','--porcelain=v1','-z'))});
const report={proof:'NODEAGENT-HEADER-INDEPENDENT-01',at:new Date().toISOString(),sourceBefore:await hashes(),gitBefore:snapshot(),checks:[],captures:[],cells:[],limitations:['Four source-only normal-motion Chromium cells; no full matrix, actual device or provider proof.','Computed font doubling is not native zoom.','Link destination requests are intercepted with a labelled diagnostic document; destination contents are not certified.','Knockout restores only old layout rules in browser memory and display:contents for the added grouping; product files untouched.'],error:null};
let server,browser;
function check(name,passed,detail){report.checks.push({name,passed:Boolean(passed),detail});assert(passed,name);}
async function state(page){return page.evaluate(()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const h=document.querySelector('.na-appbar');
 return {viewport:{width:innerWidth,height:innerHeight},header:box(h),brand:box(document.querySelector('.na-brand')),main:box(document.querySelector('.na-main')),overflow:document.documentElement.scrollWidth-innerWidth,nav:{role:document.querySelector('.na-resource-links').tagName,name:document.querySelector('.na-resource-links').getAttribute('aria-label')},links:[...h.querySelectorAll('a')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),box:box(e),focusVisible:e.matches(':focus-visible'),hit:document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)===e})),focus:document.activeElement?.textContent?.trim(),fonts:{manrope:document.fonts.check('14px Manrope'),mono:document.fonts.check('11px "JetBrains Mono"')}};
});}
async function capture(page,name){
 const s=await state(page),html=await page.content();
 await fs.writeFile(path.join(output,name+'.html'),html);
 await page.screenshot({path:path.join(output,name+'.png')});
 check(name+' DOM unchanged during capture',html===await page.content());
 await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(s,null,2)+'\n');
 report.captures.push({name,state:s,pngSha256:sha(await fs.readFile(path.join(output,name+'.png')))});
 return s;
}
try{
 server=await createServer({root,envDir:false,server:{host:'127.0.0.1',port:0,strictPort:true,open:false}});await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true});report.browser=browser.version();report.node=process.version;
 for(const [width,height] of [[390,844],[1440,960]]) for(const scale of [1,2]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'}),page=await context.newPage();
  const cell={width,height,textScale:scale*100,console:[],errors:[],failed:[],navigation:[]};
  page.on('console',m=>{if(['error','warning'].includes(m.type()))cell.console.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>cell.errors.push(String(e)));page.on('requestfailed',r=>cell.failed.push({url:r.url(),error:r.failure()}));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.continue();return route.abort();});
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  if(scale===2)await page.evaluate(()=>{const a=[...document.querySelectorAll('body,body *')].map(e=>({e,n:parseFloat(getComputedStyle(e).fontSize)}));for(const {e,n}of a)if(Number.isFinite(n))e.style.fontSize=`${n*2}px`;});
  const name=`source-${width}-text-${scale*100}`;
  const s=await capture(page,name);cell.initial=s;
  check(name+' no horizontal overflow',s.overflow===0,s.overflow);
  check(name+' main below actual header',s.main.y>=s.header.bottom-0.5);
  check(name+' named native resource navigation',s.nav.role==='NAV'&&s.nav.name==='Project resources');
  check(name+' link boxes are visible and hittable',s.links.every(l=>l.box.x>=0&&l.box.right<=width&&l.box.y>=0&&l.box.bottom<=s.header.bottom&&l.hit));
  check(name+' exact original destinations',s.links[0].href==='/nodeagent-v1.html'&&s.links[1].href==='https://github.com/HomenShum/NodeAgent');
  check(name+' correct bounded height',scale===2&&width===390?s.header.height>54:s.header.height===54,s.header.height);
  await page.locator('.na-composer-input').focus();
  for(let i=1;i>=0;i--){
   let n=0;while(n++<12){await page.keyboard.press('Shift+Tab');if(await page.locator('.na-appbar a').nth(i).evaluate(e=>e===document.activeElement))break;}
   const focused=await capture(page,name+'-focus-'+i);
   check(name+' native focus '+i,focused.links[i].focusVisible&&focused.links[i].hit);
  }
  if(width===390&&scale===2){
   const style=await page.addStyleTag({content:'.na-appbar{flex-wrap:nowrap;flex-shrink:1;gap:12px;height:54px;min-height:0;padding:0 18px}.na-brand{flex-shrink:1}.na-resource-links{display:contents}.na-link{white-space:normal}'});
   const ko=await capture(page,name+'-old-layout-knockout');
   check('old layout reproduces header failure',ko.overflow>0&&ko.links.some(l=>l.box.right>width||l.box.y<0),ko);
   cell.knockout={overflow:ko.overflow,headerHeight:ko.header.height};await style.evaluate(e=>e.remove());
   const restored=await capture(page,name+'-restored');check('candidate owner alone restores zero overflow',restored.overflow===0&&restored.header.height===s.header.height);
  }
  // Verify the actual native activation and intended request without certifying destination content.
  const urls=[base+'/nodeagent-v1.html','https://github.com/HomenShum/NodeAgent'];
  for(let i=0;i<2;i++){
   const probe=await context.newPage();await probe.goto(base,{waitUntil:'networkidle'});await probe.evaluate(()=>document.fonts.ready);
   if(scale===2)await probe.evaluate(()=>{const a=[...document.querySelectorAll('body,body *')].map(e=>({e,n:parseFloat(getComputedStyle(e).fontSize)}));for(const {e,n}of a)if(Number.isFinite(n))e.style.fontSize=`${n*2}px`;});
   await probe.route(urls[i],route=>{cell.navigation.push({input:i===0?'pointer':'keyboard',requested:route.request().url()});return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Independent navigation request fixture</title><p>Destination request captured; destination content not tested.</p>'});});
   const link=probe.locator('.na-appbar a').nth(i);if(i===0)await link.click();else{await link.focus();await probe.keyboard.press('Enter');}
   await probe.waitForURL(urls[i]);check(name+' native destination request '+i,cell.navigation.some(v=>v.requested===urls[i]));await probe.close();
  }
  check(name+' no unexpected page or console errors',cell.errors.length===0&&cell.console.every(v=>v.type!=='error')&&cell.failed.length===0,{errors:cell.errors,console:cell.console,failed:cell.failed});
  report.cells.push(cell);await context.close();
 }
}catch(e){report.error=String(e.stack??e);process.exitCode=1;}
finally{await browser?.close();await server?.close();report.sourceAfter=await hashes();report.gitAfter=snapshot();report.preserved=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter)&&JSON.stringify(report.gitBefore)===JSON.stringify(report.gitAfter);report.passed=!report.error&&report.preserved;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,captures:report.captures.length,error:report.error,preserved:report.preserved}));}
