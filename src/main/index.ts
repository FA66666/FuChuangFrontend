// src/main/index.ts
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import axios from 'axios'
import path from 'path'
import fs from 'fs'

interface SaveImageParams {
  name: string
  data: Uint8Array
}

// 定义全局变量用于存储token（登录时使用）
let authToken: string | null = null

const API_BASE_URL = 'http://localhost:3000/api/'

function createWindow(): void {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // 设置 windows 平台下的 app user model id
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  // IPC 测试
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('save-image', async (_, params: SaveImageParams) => {
    const { filePath } = await dialog.showSaveDialog({
      title: '保存图片',
      defaultPath: path.join(app.getPath('pictures'), params.name),
      filters: [
        { name: 'PNG 图片', extensions: ['png'] },
        { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
      ]
    })

    if (!filePath) {
      throw new Error('用户取消保存')
    }

    try {
      await fs.promises.writeFile(filePath, Buffer.from(params.data))
      return filePath
    } catch (error) {
      throw new Error(`保存失败: ${error.message}`)
    }
  })

  // 注册处理器
  ipcMain.handle('register-user', async (_, { username, password }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}auth/register`, {
        username,
        password
      })

      return {
        message: response.data.message
      }
    } catch (error) {
      return {
        message: error.response?.data?.message || '服务不可用，请稍后重试'
      }
    }
  })

  // 登录处理器
  ipcMain.handle('login-user', async (_, credentials) => {
    const response = await axios.post(`${API_BASE_URL}auth/login`, credentials)

    // 存储 token 到全局变量中
    if (response.data.token) {
      authToken = response.data.token
    }

    return response.data
  })

  // 修改后的当前用户获取处理器：从渲染进程的 localStorage 获取当前用户数据
  ipcMain.handle('get-current-user', async (event) => {
    try {
      // 在渲染进程中执行 localStorage.getItem('currentUser')
      const currentUserStr = await event.sender.executeJavaScript(
        "localStorage.getItem('currentUser')"
      )
      return currentUserStr ? JSON.parse(currentUserStr) : null
    } catch (error) {
      console.error('获取用户失败:', error.message)
      return null
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
