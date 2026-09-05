import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'');
const output=path.resolve(process.argv[3]??'');
const phase=process.argv[4];
assert.ok(process.argv[2] && process.argv[3] && ['before','after'].includes(phase));
await fs.mkdir(output,{recursive:false});
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['src/app/styles.css','src/features/node-agent/components/NodeAgentDemoApp.tsx','src/features/node-agent/components/NodeAgentThread.tsx','src/features/node-agent/runtime/nodeAgentChatAdapter.ts','package.json','package-lock.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));
const report={proof:'NODEAGENT-ENLARGED-HEADER-01',phase,at:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),sourceBefore:await hashes(),checks:[],cells:[],error:null,fullGrades:null};
function check(name,passed){report.checks.push({name,passed:Boolean(passed)});assert.ok(passed,name);}
let server,browser;
try{
  server=await createServer({root,envDir:false,server:{host:'127.0.0.1',port:0,strictPort:true,open:false}});
  await server.listen();
  const address=server.httpServer.address();
  const base=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true});
  report.browser=browser.version();
  for(const width of [320,390,768,1024,1440,1920])for(const scale of [1,2]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)?route.continue():route.abort();});
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.na-appbar').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const fonts=await page.evaluate(()=>({ready:document.fonts.status,manrope:document.fonts.check('14px Manrope'),mono:document.fonts.check('11px "JetBrains Mono"')}));
    if(scale===2)await page.evaluate(()=>{
      const list=Array.from(document.querySelectorAll('body,body *')).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize)}));
      for(const {e,size}of list)if(Number.isFinite(size))e.style.fontSize=`${size*2}px`;
    });
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const state=await page.evaluate(()=>{
      const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const header=document.querySelector('.na-appbar');
      const brand=document.querySelector('.na-brand');
      const links=Array.from(header.querySelectorAll('a')).map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),box:box(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
      return {viewport:{width:innerWidth,height:innerHeight},header:box(header),brand:box(brand),links,main:box(document.querySelector('.na-main')),documentOverflow:document.documentElement.scrollWidth-innerWidth,headerScrollWidth:header.scrollWidth,headerClientWidth:header.clientWidth,headerCss:{height:getComputedStyle(header).height,flexWrap:getComputedStyle(header).flexWrap,flexShrink:getComputedStyle(header).flexShrink},brandText:brand.textContent.trim()};
    });
    const name=`${phase}-${width}-text-${scale*100}`;
    const html=await page.content();await fs.writeFile(path.join(output,name+'.html'),html);
    await page.screenshot({path:path.join(output,name+'.png')});
    const sidecar={...state,fonts,errors,resizeMethod:'All original computed element text sizes sampled once then doubled; no browser/OS zoom claim.'};
    await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(sidecar,null,2)+'\n');
    if(phase==='before'&&((scale===2&&width<=390)||(scale===1&&width===1440))){
      await page.evaluate(()=>{const e=document.querySelector('.na-appbar');e.style.outline='3px solid #ff007f';e.style.outlineOffset='-3px';const label=document.createElement('div');label.id='proof-boundary';label.textContent='A · existing header owner · BEFORE';Object.assign(label.style,{position:'fixed',top:`${e.getBoundingClientRect().bottom+4}px`,left:'4px',padding:'2px 5px',background:'#ff007f',color:'white',font:'12px sans-serif',zIndex:'2147483647',pointerEvents:'none'});document.body.append(label);});
      await fs.writeFile(path.join(output,name+'-boundary.html'),await page.content());
      await page.screenshot({path:path.join(output,name+'-boundary.png')});
    }
    check(name+' no runtime exception',errors.length===0);
    if(phase==='after'){
      check(name+' header fits viewport',state.header.x>=-0.5&&state.header.right<=width+0.5&&state.headerScrollWidth<=state.headerClientWidth+1);
      check(name+' branding stays inside header',state.brand.x>=state.header.x&&state.brand.right<=state.header.right+0.5&&state.brand.y>=state.header.y&&state.brand.bottom<=state.header.bottom+0.5);
      check(name+' links remain visible and legible',state.links.length===2&&state.links.every(l=>l.box.x>=0&&l.box.right<=width+0.5&&l.box.y>=0&&l.box.bottom<=state.header.bottom+0.5&&l.scrollWidth<=l.clientWidth+1));
      check(name+' main starts below header',state.main.y>=state.header.bottom-0.5);
      const focus=[];
      await page.keyboard.press('Tab');
      for(let i=0;i<12&&focus.length<2;i++){
        const f=await page.evaluate(()=>{const e=document.activeElement;if(!e?.matches('.na-appbar a'))return null;const r=e.getBoundingClientRect();return{text:e.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,focusVisible:e.matches(':focus-visible')};});
        if(f&&!focus.some(x=>x.text===f.text))focus.push(f);
        await page.keyboard.press('Tab');
      }
      check(name+' both native header links reachable by keyboard',focus.length===2&&focus.every(f=>f.focusVisible&&f.left>=0&&f.right<=width+0.5&&f.top>=0&&f.bottom<=900));
      sidecar.focus=focus;await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(sidecar,null,2)+'\n');
    }
    report.cells.push({name,...sidecar,pngSha256:sha(await fs.readFile(path.join(output,name+'.png')))});
    await context.close();
  }
}catch(e){report.error=String(e.stack??e);process.exitCode=1;}
finally{
  await browser?.close();await server?.close();
  report.sourceAfter=await hashes();
  report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.passed=!report.error&&report.sourceUnchanged;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({proof:report.proof,phase,passed:report.passed,cells:report.cells.length,checks:report.checks.length,error:report.error}));
}
