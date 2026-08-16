import { readFileSync } from 'node:fs';
import { Packer } from 'roadroller';
import { zipSingleFile } from './tools/lib/zip.mjs';

// reconstruct the exact pre-roadroller js from the last pack run is not saved;
// quickest honest path: re-run the pack stages minus roadroller via pack's own
// output — build/index.html from a --no-roadroller run holds the terser output.
