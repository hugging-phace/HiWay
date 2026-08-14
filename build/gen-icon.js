const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;

async function capture(name) {
  const html = path.join(__dirname, name === 'symbol' ? 'gen-symbol.html' : 'gen-icon.html');
  const out = path.join(__dirname, name === 'symbol' ? 'icon.icon/Assets/waypoint.png' : 'icon.png');
  const transparent = true;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    resizable: false,
    transparent: transparent,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await win.loadFile(html);

  // force the content area to the desired size; offscreen windows are not limited by the display
  win.setMaximumSize(0, 0);
  win.setMinimumSize(1, 1);
  win.setContentSize(SIZE, SIZE);
  win.setSize(SIZE, SIZE);

  // give Chromium a moment to render the offscreen frame
  await new Promise(resolve => setTimeout(resolve, 400));

  const image = await win.capturePage();
  const png = image.toPNG();
  if (png.length === 0) throw new Error(`capturePage returned empty for ${name}`);
  fs.writeFileSync(out, png);
  console.log('wrote', out, image.getSize().width, 'x', image.getSize().height);
  win.close();
}

app.whenReady().then(async () => {
  try {
    await capture('icon');
    await capture('symbol');
    app.quit();
  } catch (e) {
    console.error(e);
    app.quit(1);
  }
});
