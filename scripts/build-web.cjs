const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
// dist is generated output; start clean so native bundles or older worker files aren't deployed.
fs.rmSync(dist,{recursive:true,force:true});
execFileSync(process.execPath,[require.resolve('expo/bin/cli'),'export','--platform','web','--clear'],{
  cwd:root,stdio:'inherit',env:{...process.env,CI:'1',EXPO_NO_TELEMETRY:'1',EXPO_PUBLIC_LOCAL_PREVIEW:'false'},
});
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
html=html.replace('</head>',`<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#285845" />
<meta name="description" content="Shared litter, puppy weight, and heat-cycle tracking for R2GD." />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="R2GD" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icons/icon-180.png" />
<meta name="mykennel-release" content="__MYKENNEL_RELEASE__" />
</head>`).replace('initial-scale=1, shrink-to-fit=no','initial-scale=1, shrink-to-fit=no, viewport-fit=cover');
fs.writeFileSync(path.join(dist,'index.html'),html);
function list(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
const files=list(dist).sort();
const worker=fs.readFileSync(path.join(__dirname,'service-worker.js'),'utf8');
const hash=createHash('sha256').update(worker);
for(const file of files)hash.update(path.relative(dist,file)).update(fs.readFileSync(file));
const release=hash.digest('hex').slice(0,16);
fs.writeFileSync(path.join(dist,'index.html'),html.replace('__MYKENNEL_RELEASE__',release));
// Cloudflare redirects /index.html to /. Cache its canonical URL to avoid cached redirects.
const assets=['/',...files.map(file=>'/'+path.relative(dist,file).split(path.sep).join('/')).filter(file=>file!=='/_headers'&&file!=='/index.html')];
fs.writeFileSync(path.join(dist,'sw.js'),worker.replace('__RELEASE__',JSON.stringify(release)).replace('__ASSETS__',JSON.stringify(assets)));
fs.writeFileSync(path.join(dist,'version.json'),JSON.stringify({release})+'\n');
console.log(`Installable myKennel web build: ${release} (${assets.length} static files). Output: dist`);
