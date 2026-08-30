// Every probe here reads the DEV hooks, which a shipping build compiles out.
// Pointed at one, a probe dies on `undefined` several frames into whatever it
// was doing, and the stack blames the assertion rather than the build.
//
// This has now cost three separate debugging detours - each time because a
// packed `--O1` build had just been written to the same directory - so the
// check lives in one place and every probe calls it before its first read.
export async function requireDevBuild(page, browser, file, pathToFileURL) {
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  if (await page.evaluate(() => typeof window.SNAP === 'undefined')) {
    console.error('\n  This needs a --cheats build; the packed one has no probes in it.');
    console.error('  Run: npm run snap:dev\n');
    await browser.close();
    process.exit(2);
  }
}
