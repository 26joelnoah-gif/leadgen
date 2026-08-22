import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// v33: elke build krijgt een uniek nummer, en er wordt een version.json
// meegebouwd. De app checkt die periodiek en toont "nieuwe versie
// beschikbaar" zodra er een nieuwe deploy live staat - open tabbladen
// draaien anders dagenlang oude code.
const buildId = Date.now().toString()

function versionFile() {
  return {
    name: 'leadgen-version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: buildId })
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  }
})
