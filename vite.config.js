import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' 
import path from 'path'
import { readFileSync } from 'fs'                                    // ← NOVO

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))      // ← NOVO

// Número único de cada build: o app instalado compara com builds/version.json
const BUILD_ID = Date.now()
const versionJsonPlugin = () => ({
  name: 'itacare-version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId: BUILD_ID, version: pkg.version, date: new Date().toISOString() }),
    })
  },
})

export default defineConfig(({ mode }) => {
  const isCapacitor = mode === 'capacitor'

  return {
    define: {                                                        // ← NOVO (bloco inteiro)
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },

    plugins: [
      react(),
      versionJsonPlugin(),
      // PWA só ativa fora do build Capacitor (web normal)
      !isCapacitor && VitePWA({ 
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'sirene-emergencia.mp3'],
        manifest: {
          name: '+iTACARÉ Comunidade Premium',
          short_name: '+iTACARÉ',
          description: 'Funcionalidades exclusivas da comunidade de Itacaré, Bahia.',
          theme_color: '#10b981',
          background_color: '#f9fafb',
          display: 'standalone',
          icons: [
            { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        }
      })
    ].filter(Boolean),
    
    // ⬇️⬇️⬇️ SEÇÃO SERVER OBRIGATÓRIA ⬇️⬇️⬇️
    server: {
      host: true,           // libera para rede local e túneis
      allowedHosts: ['all'] // desativa bloqueio de host (seguro para dev)
    },
    // ⬆️⬆️⬆️ FIM DA SEÇÃO ⬆️⬆️⬆️

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})