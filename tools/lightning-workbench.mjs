import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=await build({entryPoints:['tools/workbench/lightning.js'],bundle:true,write:false,format:'iife'});
mkdirSync('build/lightning-workbench',{recursive:true});
writeFileSync('build/lightning-workbench/index.html',`<!doctype html><meta charset=utf-8><title>Lightning workbench</title><style>body{margin:0;background:#080510;color:#ddd;font:16px system-ui;text-align:center}canvas{width:min(100%,1000px);display:block;margin:auto}button,input{margin:12px}p{color:#a9a0bd}</style><h1>Wyładowania między unicornami</h1><button id=still>Zatrzymaj kanał</button><button id=pause>Pauza / ruch</button><button id=seed>Inny kanał</button><label>Odstęp błysków <input id=rate type=range min=.18 max=1 step=.02 value=.45></label><canvas></canvas><p>Stały kanał • cienki rdzeń • słabe odnogi • krótkie powroty błysku</p><script>${out.outputFiles[0].text}</script>`);
console.log('build/lightning-workbench/index.html');
