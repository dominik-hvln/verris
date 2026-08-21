const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) walkDir(dirPath, callback);
    else callback(dirPath);
  });
}

function processDir(dir) {
  walkDir(dir, filePath => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace slate text/bg/border/ring/divide etc with neutral
      const newContent = content
        .replace(/slate-(\d+)/g, 'neutral-$1')
        .replace(/bg-slate-/g, 'bg-neutral-')
        .replace(/text-slate-/g, 'text-neutral-')
        .replace(/border-slate-/g, 'border-neutral-')
        .replace(/ring-slate-/g, 'ring-neutral-')
        .replace(/divide-slate-/g, 'divide-neutral-')
        .replace(/from-slate-/g, 'from-neutral-')
        .replace(/to-slate-/g, 'to-neutral-');

      if (content !== newContent) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}`);
      }
    }
  });
}

processDir('./apps/client-panel/src/');
