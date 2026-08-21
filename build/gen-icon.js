const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const APPX = {
  'LargeTile.png': [310, 310, 'gen-icon.html'],
  'SmallTile.png': [71, 71, 'gen-icon.html'],
  'SplashScreen.png': [620, 300, 'gen-icon-wide.html'],
  'Square150x150Logo.png': [150, 150, 'gen-icon.html'],
  'Square44x44Logo.png': [44, 44, 'gen-icon.html'],
  'StoreLogo.png': [50, 50, 'gen-icon.html'],
  'Wide310x150Logo.png': [310, 150, 'gen-icon-wide.html']
};

async function capture(out, html, width, height, transparent = false, resizeTo = null) {
  const bg = transparent ? '#00000000' : '#1a0b2e';
  const captureWidth = resizeTo ? resizeTo[0] * 2 : width;
  const captureHeight = resizeTo ? resizeTo[1] * 2 : height;

  const win = new BrowserWindow({
    width: captureWidth,
    height: captureHeight,
    show: false,
    frame: false,
    resizable: false,
    transparent,
    backgroundColor: bg,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await win.loadFile(html);

  win.setMaximumSize(0, 0);
  win.setMinimumSize(1, 1);
  win.setContentSize(captureWidth, captureHeight);

  await new Promise(resolve => setTimeout(resolve, 400));

  let image = await win.capturePage();
  win.close();

  if (resizeTo) {
    image = image.resize({ width: resizeTo[0], height: resizeTo[1], quality: 'best' });
  }

  const png = image.toPNG();
  if (png.length === 0) throw new Error(`capturePage returned empty for ${out}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  const size = image.getSize();
  console.log('wrote', out, size.width, 'x', size.height);
}

app.whenReady().then(async () => {
  try {
    const symbolHtml = path.join(ROOT, 'gen-symbol.html');

    await capture(path.join(ROOT, 'icon.png'), path.join(ROOT, 'gen-icon.html'), 1024, 1024, false);

    for (const [name, [w, h, html]] of Object.entries(APPX)) {
      await capture(path.join(ROOT, 'appx', name), path.join(ROOT, html), w, h, false, [w, h]);
    }

    await capture(path.join(ROOT, 'icon.icon', 'Assets', 'waypoint.png'), symbolHtml, 1024, 1024, true);

    app.quit();
  } catch (e) {
    console.error(e);
    app.quit(1);
  }
});
