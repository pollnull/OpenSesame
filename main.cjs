const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// A debugging port would let another program read decrypted files out of the page.
if (['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'].some((name) => app.commandLine.hasSwitch(name))) {
  app.exit(1);
}

// Portable build: keep the vault next to the .exe so it travels with it (e.g. on a USB drive).
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'OpenSesame-datos'));
}

const page = path.join(__dirname, 'web', 'index.html');
const pageUrl = pathToFileURL(page).href;
// Files the person picked or dropped this session, by random token, with the identity they had then.
const originals = new Map();
const fromPage = (event) => event.senderFrame?.url === pageUrl;

ipcMain.handle('claim-original', async (event, filePath) => {
  if (!fromPage(event) || typeof filePath !== 'string' || !filePath) return null;
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile()) return null; // also rejects symbolic links
  const token = crypto.randomUUID();
  originals.set(token, { filePath, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs });
  return token;
});

const sameIdentity = (stat, original) => stat?.isFile() && stat.dev === original.dev && stat.ino === original.ino
  && stat.size === original.size && stat.mtimeMs === original.mtimeMs;
const hashOf = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

// Deletes the original only if it is still the very file that was picked, with the content that was verified.
// It is first renamed to a random name, so nothing can be swapped in between the check and the deletion;
// if the check fails it goes back to its name.
ipcMain.handle('delete-original', async (event, token, hash) => {
  const original = originals.get(token);
  originals.delete(token);
  if (!fromPage(event) || !original || !sameIdentity(await fs.lstat(original.filePath).catch(() => null), original)) return false;
  const parked = `${original.filePath}.${crypto.randomUUID()}.opensesame-borrando`;
  if (!await fs.rename(original.filePath, parked).then(() => true, () => false)) return false;
  const verified = sameIdentity(await fs.lstat(parked).catch(() => null), original)
    && await hashOf(parked).catch(() => '') === hash;
  if (!verified) {
    // link() fails instead of overwriting if a new file took the name meanwhile; then it stays parked.
    if (await fs.link(parked, original.filePath).then(() => true, () => false)) await fs.unlink(parked).catch(() => {});
    return false;
  }
  return fs.unlink(parked).then(() => true, () => false);
});

// `opensesame lock FILE` / `opensesame unlock FILE` work in the terminal without opening a window.
const [command, file] = process.argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('--'));
if (command === 'lock' || command === 'unlock') {
  require('./cli.cjs')([command, file]).then((code) => app.exit(code));
} else app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 720,
    height: 760,
    minWidth: 380,
    minHeight: 480,
    title: 'OpenSesame',
    backgroundColor: '#0e0f12',
    webPreferences: { sandbox: true, devTools: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The page only learns whether a save really happened from here.
  win.webContents.session.on('will-download', (event, item) => {
    item.once('done', (doneEvent, state) => {
      const name = state === 'completed' ? path.basename(item.getSavePath()) : '';
      win.webContents.executeJavaScript(`notifySave(${JSON.stringify(state)}, ${JSON.stringify(name)})`);
    });
  });
  win.loadFile(page);
});

app.on('window-all-closed', () => app.quit());
