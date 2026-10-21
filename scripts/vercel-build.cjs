// Vercel build: copy the browser copy of tweetnacl next to the static pages (served at /vendor/nacl-fast.min.js).
const fs = require('fs');
fs.mkdirSync('apps/web/vendor', { recursive: true });
fs.copyFileSync('node_modules/tweetnacl/nacl-fast.min.js', 'apps/web/vendor/nacl-fast.min.js');
console.log('vendor ready');
