'use strict';

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Menu = electron.Menu;

let mainWindow;

app.on('window-all-closed', function() {
  if (process.platform != 'darwin') {
    app.quit();
  }
});

app.on('ready', function() {
  mainWindow = new BrowserWindow({width: 320, height: 410});
  mainWindow.loadURL('file://' + __dirname + '/index.html');

  mainWindow.webContents.on('context-menu', (e, props) => {
    const InputMenu = Menu.buildFromTemplate([{
      label: 'Undo',
      role: 'undo',
    }, {
      label: 'Redo',
      role: 'redo',
    }, {
      type: 'separator',
    }, {
      label: 'Cut',
      role: 'cut',
    }, {
      label: 'Copy',
      role: 'copy',
    }, {
      label: 'Paste',
      role: 'paste',
    }, {
      type: 'separator',
    }, {
      label: 'Select all',
      role: 'selectall',
    },
                                             ]);
    const { inputFieldType } = props;
    if (inputFieldType === 'plainText') {
      InputMenu.popup(mainWindow);
    }
  });

  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', function() {
    mainWindow = null;
  });
});

// メニュー情報の作成
const template = [
  {
    label: 'ファイル',
    submenu: [
      {
        label: '終了',
        accelerator: 'Control+Q',
        click(item, focusedWindow) {
          app.quit()
        }
      }
    ]
  },
  {
    label: '表示',
    submenu: [
      {
        label: 'DevTools 切り替え',
        accelerator: 'F12',
        click(item, focusedWindow) {
          focusedWindow.toggleDevTools()
        }
      },
    ]
  },
  {
    label: 'ヘルプ',
    submenu: [
      {
        label: 'バージョン情報',
        click(item, focusedWindow) {
          focusedWindow.webContents.executeJavaScript('showAboutDialog();');
        }
      },
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
