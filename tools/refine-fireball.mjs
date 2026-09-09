// Refine the selected Roadroller HTML without changing its JavaScript.
import {readFileSync,writeFileSync} from 'node:fs';
import {zipSingleFile} from './lib/zip.mjs';
const file='build/fireball/index.zip',before=readFileSync(file).length;
const result=await zipSingleFile('index.html',readFileSync('build/fireball/index.html'),{zopfliIterations:1000});
if(result.archive.length<before)writeFileSync(file,result.archive);
const after=Math.min(before,result.archive.length);
console.log({before,after,spare:13312-after});
if(after>13312)process.exitCode=1;
