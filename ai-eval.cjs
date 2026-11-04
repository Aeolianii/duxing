'use strict';

const path=require('node:path');
const {createTraceStore,summarizeTraces}=require('./ai-harness.cjs');

// Local-only report. Reading this file does not make model calls or change stored traces.
if(require.main===module) {
  const directory=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data');
  const file=process.argv[2]?path.resolve(process.argv[2]):path.join(directory,'ai-traces.json');
  try {
    console.log(JSON.stringify(summarizeTraces(createTraceStore(file).list()),null,2));
  } catch {
    console.error('无法读取 AI 执行记录，请检查文件格式与访问权限。');
    process.exitCode=1;
  }
}
