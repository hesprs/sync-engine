/*!
name: Rclone S3 Timestamp
icon: bandage
description: Preserves file modification times at server side if you are using "Rclone serve S3". This module depends on the S3 module.
source: https://sync.consensia.cc/modules.json
version: 0.1.1
readme: https://sync.consensia.cc/deep-dive/modules/rclone-s3-timestamp
*/
function e(e){if(e?.length===13)return Number(e)||void 0}const t=`x-amz-meta-mtime`;var n=class{ctx;constructor(e){this.ctx=e}start=()=>this.dispose=this.ctx.registerRemoteRequestMiddleware({apply:e=>{if(this.ctx.settings.remoteFs===`s3`)return(t,n={})=>e(t,r(n)).then(e=>({...e,headers:i(e.headers)}))},priority:307});dispose};function r(n){let r=e(n.headers?.[t]);return r?{...n,headers:{...n.headers,[t]:String(r/1e3)}}:n}function i(e){for(let[n,r]of Object.entries(e)){if(n!==t)continue;let i=Number(r);if(!i||!Number.isFinite(i))return e;e[n]=String(Math.round(i*1e3));break}return e}export{n as default};