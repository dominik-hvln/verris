const fs = require('fs');

const files = [
  'apps/client-panel/src/app/dashboard/dns/page.tsx',
  'apps/client-panel/src/app/dashboard/ssl/page.tsx',
  'apps/client-panel/src/app/dashboard/ftp/page.tsx',
  'apps/client-panel/src/app/dashboard/cron/page.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/bg-slate-950(\/[0-9]+)?/g, 'bg-[#0a0a0a]$1');
  content = content.replace(/bg-slate-900(\/[0-9]+)?/g, 'bg-[#050505]$1');
  content = content.replace(/bg-slate-800(\/[0-9]+)?/g, 'bg-[#121212]$1');
  // the text-slate-400 and text-slate-500 are okay, let's keep them
  // border-slate-something -> border-white/10
  content = content.replace(/border-slate-[0-9]+(\/[0-9]+)?/g, 'border-white/10');
  
  // also adjust hover for bg-slate-900 / 800
  content = content.replace(/hover:bg-slate-900(\/[0-9]+)?/g, 'hover:bg-[#121212]$1');
  content = content.replace(/hover:bg-slate-800(\/[0-9]+)?/g, 'hover:bg-[#1a1a1a]$1');
  
  fs.writeFileSync(file, content, 'utf8');
});
console.log('Replaced bg-slate with hex colors in 4 files.');
