// Explicit allowlist: never bundle .env, .git, caches or unexpected private files.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=`
from pathlib import Path
import zipfile
root=Path.cwd()
files=['index.html','style.css','app.js','core.js','amap-client.js','map-ui.js','discovery.js','server.cjs','ai-service.cjs','ai-client.js','reviews.js','reviews.cjs','freewheel.js','travel-core.js','travel.js','travel-test.cjs','ai-test.cjs','test.cjs','map-test.cjs','review-test.cjs','package.cjs','.env.example','README.md','高德接入说明.md','验证记录.md','启动原型.cmd']
destination=root.parent/'都行-demo原型.zip'
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as bundle:
    for name in files: bundle.write(root/name,'demo/'+name)
    for name in ['food','play','travel','custom']:
        bundle.write(root/'assets'/(name+'.png'),'demo/assets/'+name+'.png')
    for file in (root/'screenshots').iterdir():
        if file.suffix in ['.jpg','.png']: bundle.write(file,'demo/screenshots/'+file.name)
print('Packaged demo; local credentials excluded.')
`;
const result=spawnSync('python',['-X','utf8','-c',script],{cwd:__dirname,stdio:'inherit'});
process.exitCode=result.status??1;
