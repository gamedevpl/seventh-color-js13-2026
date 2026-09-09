// Exercise the shipped page without DEV hooks: mobile menu -> real relay -> wire input.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startRelay} from './lib/relay.mjs';
const relay=await startRelay(),browsers=[],pages=[],errors=[];
try {
 for(let i=0;i<2;i++) {
  const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});browsers.push(browser);
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(url=>{
   window.wire={};const Base=WebSocket;
   window.WebSocket=class extends Base {
    constructor(){super(url);this.addEventListener('message',e=>{if(typeof e.data!=='string'){const b=new Uint8Array(e.data);if(b[0]===2)wire.received=[...b];}});}
    send(data){if(typeof data!=='string'){const b=new Uint8Array(data.buffer||data,data.byteOffset||0,data.byteLength);if(b[0]===1){wire.role=1;wire.snapshot=[...b];}if(b[0]===2){wire.role=0;wire.input=[...b];}}super.send(data);}
   };
  },relay.url+'/packed-online');
  await page.goto('file://'+process.cwd()+'/build/fireball/index.html');
  await page.waitForFunction(()=>document.querySelectorAll('canvas').length===2);
  const r=await page.locator('canvas').last().boundingBox();
  await page.touchscreen.tap(r.x+r.width/2,r.y+r.height*298/360);
 }
 await Promise.all(pages.map(p=>p.waitForFunction(()=>wire.input?.length===4||wire.snapshot?.[3]===2,null,{timeout:30000})));
 const host=await pages[0].evaluate(()=>wire.role===1)?pages[0]:pages[1],guest=pages.find(p=>p!==host);
 await host.waitForFunction(()=>wire.snapshot?.[3]===2);
 const cdp=await guest.context().newCDPSession(guest),r=await guest.locator('canvas').last().boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[160,500].map((x,i)=>({id:i+1,x:r.x+x*r.width/640,y:r.y+230*r.height/360}))});
 await guest.waitForFunction(()=>wire.input?.[2]&16);
 await host.waitForFunction(()=>wire.received?.[2]&16);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await host.waitForFunction(()=>wire.received&&!(wire.received[2]&16));
 await guest.keyboard.down('ArrowRight');await host.waitForFunction(()=>(wire.received?.[2]&3)===2);await guest.keyboard.up('ArrowRight');
 assert.deepEqual(errors,[]);
 console.log('PASS packed mobile ONLINE button, v3 handshake, two-thumb charge/release and steering through relay');
} finally {for(const b of browsers)await b.close();relay.close();}
