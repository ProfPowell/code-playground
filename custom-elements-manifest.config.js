function stripPrivateMembers() {
  return {
    name: 'strip-private-members',
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules || []) {
        for (const decl of mod.declarations || []) {
          if (decl.members) {
            decl.members = decl.members.filter(
              (member) => !member.name.startsWith('_') && !member.name.startsWith('#')
            )
          }
        }
      }
    }
  }
}

function addCssParts() {
  return {
    name: 'add-css-parts',
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules || []) {
        for (const decl of mod.declarations || []) {
          if (decl.tagName === 'code-playground') {
            decl.cssParts = [
              { name: 'toolbar', description: 'The toolbar containing file tabs, status, and primary actions.' },
              { name: 'editor-panel', description: 'The editor workspace panel that hosts the CodeMirror instances.' },
              { name: 'preview-panel', description: 'The preview iframe panel.' },
              { name: 'console-panel', description: 'The console output panel that shows logs and runtime errors.' }
            ]
          }
        }
      }
    }
  }
}

export default {
  globs: ['src/**/*.js'],
  exclude: ['src/**/*.test.js'],
  outdir: '.',
  litelement: false,
  plugins: [stripPrivateMembers(), addCssParts()]
}
