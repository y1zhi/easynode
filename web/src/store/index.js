import { io } from 'socket.io-client'
import { defineStore, acceptHMRUpdate } from 'pinia'
import dayjs from 'dayjs'
import $api from '@/api'
import config from '@/config'
import { isHttps } from '@/utils'

const { defaultClientPort } = config

const useStore = defineStore({
  id: 'global',
  state: () => ({
    serviceURI: null,
    hostList: [],
    groupList: [],
    sshList: [],
    scriptList: [],
    localScriptList: [],
    HostStatusSocket: null,
    user: localStorage.getItem('user') || null,
    token: sessionStorage.getItem('token') || localStorage.getItem('token') || null,
    title: '',
    isDark: false,
    menuCollapse: localStorage.getItem('menuCollapse') === 'true',
    defaultBackgroundImages: [
      'https://wmimg.com/i/1099/2024/08/66c42ff3cd6ab.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff3e3f45.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff411ffb.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff4c5753.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff4e8b4d.jpg',
      'https://wmimg.com/i/1099/2024/08/66c42ff51ee3a.jpg',
      'https://wmimg.com/i/1099/2024/08/66c42ff5db377.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff536a64.png',
      'https://wmimg.com/i/1099/2024/08/66c42ff51d8dd.png',
    ],
    terminalConfig: {
      ...{
        fontSize: 16,
        themeName: 'Afterglow',
        background: '',
        quickCopy: isHttps(),
        quickPaste: isHttps(),
        autoExecuteScript: false
      },
      ...(localStorage.getItem('terminalConfig') ? JSON.parse(localStorage.getItem('terminalConfig')) : {})
    }
  }),
  actions: {
    async setJwtToken(token, isSession = true) {
      if (isSession) sessionStorage.setItem('token', token)
      else localStorage.setItem('token', token)
      this.$patch({ token })
    },
    async setUser(username) {
      localStorage.setItem('user', username)
      this.$patch({ user: username })
    },
    async setTitle(title) {
      this.$patch({ title })
    },
    async clearJwtToken() {
      localStorage.clear('token')
      sessionStorage.clear('token')
      this.$patch({ token: null })
    },
    async getMainData() {
      await this.getGroupList()
      await this.getHostList()
      await this.getSSHList()
      await this.getScriptList()
      this.wsClientsStatus()
    },
    async getHostList() {
      let { data: newHostList } = await $api.getHostList()
      newHostList = newHostList.map(newHostObj => {
        newHostObj.expired = dayjs(newHostObj.expired).format('YYYY-MM-DD')
        const oldHostObj = this.hostList.find(({ id }) => id === newHostObj.id)
        return oldHostObj ? Object.assign({}, { ...oldHostObj }, { ...newHostObj }) : newHostObj
      })
      this.$patch({ hostList: newHostList })
      this.HostStatusSocket?.emit('refresh_clients_data')
    },
    async getGroupList() {
      const { data: groupList } = await $api.getGroupList()
      this.$patch({ groupList })
    },
    async getSSHList() {
      const { data: sshList } = await $api.getSSHList()
      this.$patch({ sshList })
    },
    async getScriptList() {
      const { data: scriptList } = await $api.getScriptList()
      this.$patch({ scriptList })
    },
    async getLocalScriptList() {
      const { data: localScriptList } = await $api.getLocalScriptList()
      this.$patch({ localScriptList })
    },
    setTerminalSetting(setTarget = {}) {
      let newConfig = { ...this.terminalConfig, ...setTarget }
      localStorage.setItem('terminalConfig', JSON.stringify(newConfig))
      this.$patch({ terminalConfig: newConfig })
    },
    async wsClientsStatus() {
      // if (this.HostStatusSocket) this.HostStatusSocket.close()
      let socketInstance = io(this.serviceURI, {
        path: '/clients',
        forceNew: true,
        reconnectionDelay: 5000,
        reconnectionAttempts: 1000
      })
      this.HostStatusSocket = socketInstance
      socketInstance.on('connect', () => {
        console.log('clients websocket 已连接: ', socketInstance.id)
        let token = this.token
        socketInstance.emit('init_clients_data', { token })
        socketInstance.on('clients_data', (data) => {
          // console.log(data)
          this.hostList.forEach(item => {
            const { host, clientPort } = item
            return Object.assign(item, { monitorData: Object.freeze(data[`${ host }:${ clientPort || defaultClientPort }`]) })
          })
        })
        socketInstance.on('token_verify_fail', (message) => {
          console.log('token 验证失败:', message)
          // $router.push('/login')
        })
      })
      socketInstance.on('disconnect', () => {
        console.error('clients websocket 连接断开')
      })
      socketInstance.on('connect_error', (message) => {
        console.error('clients websocket 连接出错: ', message)
      })
    },
    setTheme(isDark, animate = true) {
      // $store.setThemeConfig({ isDark: val })
      const html = document.documentElement
      let setAttribute = () => {
        if (isDark) html.setAttribute('class', 'dark')
        else html.setAttribute('class', '')
        localStorage.setItem('isDark', isDark)
        this.$patch({ isDark })
      }
      if (animate) {
        let transition = document.startViewTransition(() => {
          document.documentElement.classList.toggle('dark')
        })
        transition.ready.then(() => {
          const centerX = 0
          const centerY = 0
          const radius = Math.hypot(
            Math.max(centerX, window.innerWidth - centerX),
            Math.max(centerY, window.innerHeight - centerY)
          )
          // console.log('radius: ', innerWidth, innerHeight, radius)
          // 自定义动画
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0% at ${ centerX }px ${ centerY }px)`,
                `circle(${ radius }px at ${ centerX }px ${ centerY }px)`,
              ]
            },
            {
              duration: 500,
              pseudoElement: '::view-transition-new(root)'
            }
          )
          setAttribute()
        })
      } else {
        setAttribute()
      }
    },
    setDefaultTheme() {
      let isDark = false
      if (localStorage.getItem('isDark')) {
        isDark = localStorage.getItem('isDark') === 'true' ? true : false
      } else {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)')
        const systemTheme = prefersDarkScheme.matches
        console.log('当前系统使用的是深色模式：', systemTheme ? '是' : '否')
        isDark = systemTheme
      }
      this.setTheme(isDark, false)
    },
    setMenuCollapse() {
      let newState = !this.menuCollapse
      localStorage.setItem('menuCollapse', newState)
      this.$patch({ menuCollapse: newState })
    }
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useStore, import.meta.hot))
}

export default useStore
