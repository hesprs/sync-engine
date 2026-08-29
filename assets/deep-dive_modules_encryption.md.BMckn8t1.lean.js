import{$ as e,Ct as t,Dt as n,J as r,Mt as i,Q as a,R as o,St as s,W as c,X as l,Z as u,_t as d,ct as f,lt as p,nt as m,q as h,tt as g,ut as _,v as ee,vt as te,yt as v}from"./chunks/framework.es-12sf8.js";var y={nodes:[{id:`1b5c9a513992802e`,type:`group`,x:-380,y:140,width:280,height:180,label:`File Info`},{id:`fe9b7a0bce528584`,type:`group`,x:-320,y:-320,width:220,height:180,label:`Server Info`},{id:`b49169aebac7e5df`,type:`group`,x:360,y:-30,width:340,height:100,label:`Sub-Keys`},{id:`a5d52cd03f802a4a`,type:`text`,text:`<p>File Content</p>
`,styleAttributes:{},x:385,y:410,width:130,height:60,color:`1`},{id:`c5c4295e29846375`,type:`text`,text:`<p>File Key</p>
`,styleAttributes:{},x:400,y:210,width:100,height:60,color:`3`},{id:`4e11d8bcaaa494b4`,type:`text`,text:`<p>File Name</p>
`,styleAttributes:{},x:560,y:410,width:120,height:60,color:`1`},{id:`6845f2a8ca1be92a`,type:`text`,text:`<p>Master Salt</p>
`,styleAttributes:{},x:50,y:-260,width:140,height:60,color:`4`},{id:`9a92edcf086c3cfc`,type:`text`,text:`<p>Root File Key</p>
`,styleAttributes:{},x:380,y:-10,width:140,height:60,color:`3`},{id:`b920a936964d171b`,type:`text`,text:`<p>Name Key</p>
`,styleAttributes:{},x:560,y:-10,width:120,height:60,color:`3`},{id:`81209c25b6a24e46`,type:`text`,text:`<p>User Password</p>
`,styleAttributes:{},x:400,y:-400,width:260,height:60,color:`1`},{id:`29b02edaa8bceae2`,type:`text`,text:`<p>Master Key</p>
`,styleAttributes:{},x:400,y:-260,width:260,height:60,color:`3`},{id:`7a1349f6230992a8`,type:`text`,text:`<p>File Key Salt</p>
`,styleAttributes:{},x:50,y:200,width:140,height:60,color:`4`},{id:`c57b4ce06800705b`,type:`text`,text:`<p>Chunk Count</p>
`,styleAttributes:{},x:50,y:410,width:140,height:60,color:`4`},{id:`50e58d54fe68ca4f`,type:`text`,text:`<p>File Size</p>
`,styleAttributes:{},x:-360,y:160,width:240,height:60},{id:`07383709d870ec65`,type:`text`,text:`<p>16 Byte Random File Salt</p>
`,styleAttributes:{},x:-360,y:240,width:240,height:60},{id:`7027ed14bd3c7157`,type:`text`,text:`<p>Account Name</p>
`,styleAttributes:{},x:-300,y:-300,width:180,height:60},{id:`17f64446d28226d6`,type:`text`,text:`<p>Server Endpoint</p>
`,styleAttributes:{},x:-300,y:-220,width:180,height:60}],edges:[{id:`4d4106e7c8dcc873`,styleAttributes:{},toFloating:!1,fromNode:`6845f2a8ca1be92a`,fromSide:`right`,toNode:`29b02edaa8bceae2`,toSide:`left`,label:`Argon2id (salt)`},{id:`e38e9cbd80d353c3`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`81209c25b6a24e46`,fromSide:`bottom`,toNode:`29b02edaa8bceae2`,toSide:`top`,label:`Argon2id (credential)`},{id:`0d9c97fc8e566a33`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`29b02edaa8bceae2`,fromSide:`bottom`,toNode:`b49169aebac7e5df`,toSide:`top`,label:`HKDF-SHA-256
(credential)`},{id:`72d5878d3db0a378`,styleAttributes:{},toFloating:!1,fromNode:`b920a936964d171b`,fromSide:`bottom`,toNode:`4e11d8bcaaa494b4`,toSide:`top`,label:`AES-GCM-SIV-256
(credential)`},{id:`b8a9632928d26a20`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`7a1349f6230992a8`,fromSide:`right`,toNode:`c5c4295e29846375`,toSide:`left`,label:`HKDF-SHA-256
(salt)`},{id:`9ab3f5463d6bfd9e`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`9a92edcf086c3cfc`,fromSide:`bottom`,toNode:`c5c4295e29846375`,toSide:`top`,label:`HKDF-SHA-256
(credential)`},{id:`fe840e9b8182f532`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`fe9b7a0bce528584`,fromSide:`right`,toNode:`6845f2a8ca1be92a`,toSide:`left`,label:`SHA256`},{id:`58adf75622563d6f`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`1b5c9a513992802e`,fromSide:`right`,toNode:`7a1349f6230992a8`,toSide:`left`,label:`SHA256`},{id:`3feb7be50a80a339`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`c5c4295e29846375`,fromSide:`bottom`,toNode:`a5d52cd03f802a4a`,toSide:`top`,label:`AES-GCM-256
(credential)`},{id:`3011a2a5c8ae3862`,styleAttributes:{},toFloating:!1,fromFloating:!1,fromNode:`c57b4ce06800705b`,fromSide:`right`,toNode:`a5d52cd03f802a4a`,toSide:`left`,label:`AES-GCM-256
(nonce)`}],metadata:{version:`1.0-1.0`,frontmatter:{}}},b=class{container;augment;onStart;onRestart;onDispose;constructor(e,t,n,r,i,a){this.container=e,this.augment=a,this.options=t,this.onStart=n.subscribe,this.onDispose=r.subscribe,this.onRestart=i.subscribe}options},ne=`.JSON-Canvas-Viewer {
  --contentTransition: color 200ms, opacity 200ms, text-shadow 200ms, fill 200ms;
  --containerTransition:
  	background 200ms, opacity 200ms, box-shadow 200ms, border 200ms, filter 200ms,
  	backdrop-filter 200ms;
  color: var(--text);
  fill: var(--text);
  stroke: var(--text);
  background-color: var(--background);
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.JSON-Canvas-Viewer.JCV-numb, .JSON-Canvas-Viewer.JCV-numb * {
  pointer-events: none !important;
}
.JSON-Canvas-Viewer .JCV-full, .JSON-Canvas-Viewer .JCV-overlay-container .JCV-click-layer, .JSON-Canvas-Viewer .JCV-overlay-container .JCV-link-iframe,
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-audio,
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-video, .JSON-Canvas-Viewer .JCV-overlay-container .JCV-content {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  position: absolute;
}
.JSON-Canvas-Viewer .JCV-flex-center, .JSON-Canvas-Viewer .JCV-overlay-container .JCV-content.JCV-markdown-content {
  display: flex;
  justify-content: center;
  align-items: center;
}
.JSON-Canvas-Viewer .JCV-border-shadow-bg {
  background: var(--background-secondary);
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow);
}
.JSON-Canvas-Viewer .JCV-button {
  cursor: pointer;
  font-size: 18px;
  height: 32px;
  border: none;
  transition: var(--containerTransition);
  background-color: var(--background-secondary);
  text-align: center;
  width: 32px;
  padding: 5px 0px;
}
.JSON-Canvas-Viewer .JCV-button svg {
  width: 100%;
  height: 100%;
}
.JSON-Canvas-Viewer .JCV-button:hover {
  background-color: var(--border);
}
.JSON-Canvas-Viewer .JCV-button.JCV-collapse-button {
  border-radius: 8px;
  transition: transform 200ms, background-color 200ms;
}
.JSON-Canvas-Viewer .JCV-collapsed .JCV-collapse-button {
  transform: rotate(180deg);
}
.JSON-Canvas-Viewer .JCV-main-canvas {
  width: 100%;
  height: 100%;
  transform-origin: top left;
}
.JSON-Canvas-Viewer .JCV-overlays {
  position: absolute;
  transform-origin: top left;
  will-change: transform;
}
.JSON-Canvas-Viewer .JCV-overlay-container {
  position: absolute;
  box-sizing: border-box;
  border-radius: 12px;
  user-select: none;
  contain: strict;
  content-visibility: auto;
  background-color: var(--overlay-card);
  transition: var(--containerTransition);
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-overlay-border {
  box-sizing: border-box;
  pointer-events: none;
  position: absolute;
  color: var(--overlay-border);
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-width: var(--overlay-border-width);
  border-style: solid;
  border-radius: 12px;
  transition: var(--containerTransition);
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-content {
  overflow: hidden;
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-content.JCV-markdown-content {
  position: absolute;
  padding: 0 7px;
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-content.JCV-markdown-content.rtl {
  direction: rtl;
  text-align: right;
}
.JSON-Canvas-Viewer .JCV-overlay-container.JCV-active {
  user-select: auto;
  pointer-events: auto;
}
.JSON-Canvas-Viewer .JCV-overlay-container.JCV-active .JCV-overlay-border {
  border: 4px solid var(--overlay-active);
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-link-iframe,
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-audio,
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-video {
  border: none;
  background: transparent;
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-click-layer {
  background: transparent;
  pointer-events: auto;
}
.JSON-Canvas-Viewer .JCV-overlay-container.JCV-active .JCV-click-layer {
  pointer-events: none;
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.JSON-Canvas-Viewer .JCV-overlay-container.JCV-active .JCV-img {
  pointer-events: auto;
}
.JSON-Canvas-Viewer .JCV-overlay-container .JCV-parsed-content-wrapper {
  font-family: sans-serif;
  box-sizing: border-box;
  max-width: 100%;
  max-height: 100%;
  padding: 10px 6px;
  pointer-events: none;
  overflow: hidden;
  scrollbar-gutter: stable both-edges;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@supports not (scrollbar-gutter: stable both-edges) {
  .JSON-Canvas-Viewer .JCV-overlay-container .JCV-parsed-content-wrapper {
    padding: 10px;
  }
}
.JSON-Canvas-Viewer .JCV-overlay-container.JCV-active .JCV-parsed-content-wrapper {
  overflow: auto;
  pointer-events: auto;
}
.JSON-Canvas-Viewer .JCV-markdown-content ::-webkit-scrollbar {
  width: 4px;
}
.JSON-Canvas-Viewer .JCV-markdown-content ::-webkit-scrollbar-track {
  background-color: transparent;
}
.JSON-Canvas-Viewer .JCV-markdown-content ::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
}
.JSON-Canvas-Viewer .JCV-markdown-content ::-webkit-scrollbar-thumb:hover {
  background: rgba(30, 30, 30, 0.75);
}
.JSON-Canvas-Viewer .JCV-markdown-content p {
  font-size: 16px;
  line-height: 21px;
}
.JSON-Canvas-Viewer .JCV-markdown-content img {
  width: 100%;
  border-radius: 8px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h1 {
  font-size: 25px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h2 {
  font-size: 23px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h3 {
  font-size: 22px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h4 {
  font-size: 20px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h5 {
  font-size: 19px;
}
.JSON-Canvas-Viewer .JCV-markdown-content h6 {
  font-size: 17px;
}
.JSON-Canvas-Viewer .JCV-markdown-content p,
.JSON-Canvas-Viewer .JCV-markdown-content h1,
.JSON-Canvas-Viewer .JCV-markdown-content h2,
.JSON-Canvas-Viewer .JCV-markdown-content h3,
.JSON-Canvas-Viewer .JCV-markdown-content h4,
.JSON-Canvas-Viewer .JCV-markdown-content h5,
.JSON-Canvas-Viewer .JCV-markdown-content h6,
.JSON-Canvas-Viewer .JCV-markdown-content ol,
.JSON-Canvas-Viewer .JCV-markdown-content ul {
  margin: 0;
}
.JSON-Canvas-Viewer .JCV-markdown-content h1,
.JSON-Canvas-Viewer .JCV-markdown-content h2 {
  font-weight: 800;
}
.JSON-Canvas-Viewer .JCV-markdown-content h3,
.JSON-Canvas-Viewer .JCV-markdown-content h4 {
  font-weight: 700;
}
.JSON-Canvas-Viewer .JCV-markdown-content h5,
.JSON-Canvas-Viewer .JCV-markdown-content h6 {
  font-weight: 600;
}
.JSON-Canvas-Viewer .JCV-markdown-content code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 4px;
  border-radius: 8px;
}
pre .JSON-Canvas-Viewer .JCV-markdown-content code {
  display: block;
  box-sizing: border-box;
  width: 100%;
}
.JSON-Canvas-Viewer .JCV-markdown-content pre:has(code),
.JSON-Canvas-Viewer .JCV-markdown-content table {
  margin: 6px 0;
}
.JSON-Canvas-Viewer .JCV-markdown-content strong {
  color: rgb(254, 142, 124);
}
.JSON-Canvas-Viewer .JCV-markdown-content em {
  color: rgb(90, 255, 178);
}
.JSON-Canvas-Viewer .JCV-markdown-content a {
  text-decoration: none;
  color: rgb(109, 173, 208);
  font-weight: 800;
  font-style: italic;
  cursor: pointer;
  transition: var(--contentTransition);
}
.JSON-Canvas-Viewer .JCV-markdown-content a:hover {
  color: rgb(134, 211, 253);
}
.JSON-Canvas-Viewer .JCV-markdown-content hr {
  height: 1px;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.2);
  border: none;
}
.JSON-Canvas-Viewer .JCV-markdown-content li {
  margin: 5px 0;
}
.JSON-Canvas-Viewer .JCV-markdown-content ul {
  padding-left: 16px;
}
.JSON-Canvas-Viewer .JCV-markdown-content ol {
  padding-left: 15px;
  padding-right: 7.5px;
}
.JSON-Canvas-Viewer .JCV-markdown-content table {
  border-collapse: collapse;
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
}
.JSON-Canvas-Viewer .JCV-markdown-content table th,
.JSON-Canvas-Viewer .JCV-markdown-content table td {
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.06);
  text-align: left;
}
.JSON-Canvas-Viewer .JCV-markdown-content table th {
  background: rgba(255, 255, 255, 0.12);
  font-weight: bold;
}
`,x=Error(`[JSONCanvasViewer] Resource hasn't been set up or has been disposed.`);function S(e,t){let n=document.createElement(`style`);n.innerHTML=t,e.appendChild(n)}function C(e,t,n,r,i,a){e.beginPath(),e.moveTo(t+a,n),e.lineTo(t+r-a,n),e.quadraticCurveTo(t+r,n,t+r,n+a),e.lineTo(t+r,n+i-a),e.quadraticCurveTo(t+r,n+i,t+r-a,n+i),e.lineTo(t+a,n+i),e.quadraticCurveTo(t,n+i,t,n+i-a),e.lineTo(t,n+a),e.quadraticCurveTo(t,n,t+a,n),e.closePath()}function w(e,t){let n=e.x+e.width/2,r=e.y+e.height/2;switch(t){case`top`:return{x:n,y:e.y};case`bottom`:return{x:n,y:e.y+e.height};case`left`:return{x:e.x,y:r};case`right`:return{x:e.x+e.width,y:r};default:return{x:n,y:r}}}function re(e,t,n){let r=window.devicePixelRatio??1,i=e.getContext(`2d`);if(!i)throw Error(`[JSONCanvasViewer] This error is unexpected, probably caused uncontrollable runtime errors. Please contact the developer and show how to reproduce.`);e.width=Math.round(t*r),e.height=Math.round(n*r),i.setTransform(1,0,0,1,0,0),i.scale(r,r)}function T(e=!1){let t=(...n)=>{let r=t.subs.values().toArray();for(let t of e?r.toReversed():r)t(...n)};return t.subs=new Set,t.subscribe=e=>(t.subs.add(e),()=>t.unsubscribe(e)),t.unsubscribe=e=>{t.subs.delete(e)},t}var E=class extends b{onToggleFullscreen=T();data={canvasData:{edges:[],nodes:[]},container:document.createElement(`div`),edgeMap:{},nodeBounds:{centerX:0,centerY:0,height:0,maxX:0,maxY:0,minX:0,minY:0,width:0},nodeMap:{},offsetX:0,offsetY:0,scale:1};constructor(...e){super(...e);let t=this.options.container;for(;t.firstElementChild;)t.firstElementChild.remove();t.innerHTML=``;let n=this.options.shadowed?t.attachShadow({mode:`open`}):t;S(n,ne),this.data.container.classList.add(`JSON-Canvas-Viewer`),n.appendChild(this.data.container),this.augment({onToggleFullscreen:this.onToggleFullscreen,resetView:this.resetView,toggleFullscreen:this.toggleFullscreen}),this.onStart(this.start),this.onRestart(this.start),this.onDispose(this.dispose)}start=()=>{let e={edges:[],nodes:[],...this.options.canvas};Object.assign(this.data,{canvasData:e,edgeMap:{},nodeBounds:this.calculateNodeBounds(e),nodeMap:{},offsetX:0,offsetY:0,scale:1}),this.data.canvasData.nodes.forEach(e=>{let t={box:this.getNodeBox(e),ref:e};if(this.data.nodeMap[e.id]=t,e.type===`file`){let n=e.file,r=n.split(`/`).pop()??``,i=r.lastIndexOf(`?`);if(t.fileName=i===-1?r:r.slice(0,i),!e.file.includes(`://`)){let t=this.options.attachments?.[n];t&&(e.file=t)}}}),this.data.canvasData.edges.forEach(e=>{this.data.edgeMap[e.id]={box:this.getEdgeBox(e),ref:e}}),this.resetView()};processBaseDir=e=>e?e?.slice(-1)===`/`?e:`${e}/`:`./`;getNodeBox=e=>({bottom:e.y+e.height,left:e.x,right:e.width+e.x,top:e.type===`file`||e.type===`group`?e.y-40:e.y});getEdgeBox=e=>{let t=this.data.nodeMap,n=t[e.fromNode].ref,r=t[e.toNode].ref,i=w(n,e.fromSide),a=w(r,e.toSide),o={bottom:Math.max(i.y,a.y),left:Math.min(i.x,a.x),right:Math.max(i.x,a.x),top:Math.min(i.y,a.y)},s=o.right-o.left,c=o.bottom-o.top,l=Math.min(s,c),u=Math.log2(Math.max(s,c)/(l===0?1:l))*10;return{bottom:o.bottom+u,left:o.left-u,right:o.right+u,top:o.top-u}};calculateNodeBounds(e){let t=1/0,n=1/0,r=-1/0,i=-1/0;e.nodes.forEach(e=>{t=Math.min(t,e.x),n=Math.min(n,e.y),r=Math.max(r,e.x+e.width),i=Math.max(i,e.y+e.height)});let a=r-t,o=i-n;return{centerX:t+a/2,centerY:n+o/2,height:o,maxX:r,maxY:i,minX:t,minY:n,width:a}}toggleFullscreen=async e=>{!document.fullscreenElement&&(!e||e===`enter`)?(await this.data.container.requestFullscreen(),this.onToggleFullscreen(`enter`)):document.fullscreenElement&&(!e||e===`exit`)&&(await document.exitFullscreen(),this.onToggleFullscreen(`exit`))};resetView=()=>{let e=this.data.nodeBounds,t=this.data.container;if(!e||!t)return;let n=e.width+200,r=e.height+200,i=t.clientWidth,a=t.clientHeight,o=i/n,s=a/r,c=Math.round(Math.min(o,s)*1e3)/1e3,l=e.centerX,u=e.centerY,d={offsetX:i/2-l*c,offsetY:a/2-u*c,scale:c};this.data.offsetX=d.offsetX,this.data.offsetY=d.offsetY,this.data.scale=d.scale};middleViewer=()=>{let e=this.data.container;return{height:e.clientHeight,width:e.clientWidth,x:e.clientWidth/2,y:e.clientHeight/2}};dispose=()=>{this.data.container.remove()}},D=(e,t,n)=>e>=t&&e<=n,ie=e=>{if(typeof e==`number`)return D(e,0,1);if(typeof e==`string`){let t=parseFloat(e);return!isNaN(t)&&(e.endsWith(`%`)?D(t/100,0,1):D(t,0,1))}return!1},O=e=>{let t=e.trim();return t?t.endsWith(`%`)?Number(t.slice(0,-1))/100*255:Number(t):NaN},ae=e=>typeof e==`string`?se(e):typeof e==`object`&&!!e&&oe(e),oe=e=>{let{red:t,green:n,blue:r,alpha:i}=e;return D(t,0,255)&&D(n,0,255)&&D(r,0,255)&&(i===void 0||D(i,0,1))},se=e=>{let t=e.match(/^rgba?\(\s*(\d{1,3}|[\d.]+%)\s*[, ]\s*(\d{1,3}|[\d.]+%)\s*[, ]\s*(\d{1,3}|[\d.]+%)\s*(?:[,/]\s*([01]?\.?\d+%?))?\s*\)$/);if(!t)return!1;let[,n,r,i,a]=t,o=O(n),s=O(r),c=O(i);return!!(D(o,0,255)&&D(s,0,255)&&D(c,0,255))&&(a===void 0||ie(a))},ce=e=>{let t=e.trim().toLowerCase().match(/^(-?[\d.]+)(deg|rad|grad|turn)?$/);if(!t)return NaN;let n=parseFloat(t[1]),r=t[2];if(isNaN(n))return NaN;let i;switch(r){case`rad`:i=180*n/Math.PI;break;case`grad`:i=n/400*360;break;case`turn`:i=360*n;break;default:i=n}return(i%360+360)%360},le=e=>{if(typeof e==`number`){if(!D(e,0,1))throw Error(`Alpha value must be between 0 and 1`);return e}if(typeof e==`string`){let t=e.trim(),n;if(n=t.endsWith(`%`)?Number(t.slice(0,-1))/100:Number(t),isNaN(n))throw Error(`Invalid alpha value: "${e}"`);if(!D(n,0,1))throw Error(`Alpha value must be between 0 and 1`);return n}throw Error(`Invalid alpha value format`)},ue=e=>{if(typeof e!=`string`)throw Error(`Invalid HSL color format`);let t=e.match(/^hsla?\(\s*(-?[\d.]+(?:deg|rad|grad|turn)?)\s*[, ]\s*(-?[\d.]+%?)\s*[, ]\s*(-?[\d.]+%?)\s*(?:[,/]\s*(-?[\d.]+%?))?\s*\)$/i);if(!t)throw Error(`Invalid HSL color format`);let[,n,r,i,a]=t,o=ce(n),s=parseFloat(r),c=parseFloat(i);if(isNaN(o)||isNaN(s)||isNaN(c)||!D(s,0,100)||!D(c,0,100))throw Error(`Invalid HSL color values`);return a===void 0?{hue:o,saturation:s,lightness:c,alpha:1}:{hue:o,saturation:s,lightness:c,alpha:le(a)}},de=e=>{if(typeof e!=`string`)throw Error(`Invalid RGB color format`);let t=e.match(/^rgba?\(\s*(-?[\d.]+%?)\s*[, ]\s*(-?[\d.]+%?)\s*[, ]\s*(-?[\d.]+%?)\s*(?:[,/]\s*(-?[\d.]+%?))?\s*\)$/i);if(!t)throw Error(`Invalid RGB color format`);let[,n,r,i,a]=t,o=O(n),s=O(r),c=O(i);if(!D(o,0,255)||!D(s,0,255)||!D(c,0,255))throw Error(`RGB values must be between 0 and 255`);return{red:o,green:s,blue:c,alpha:a===void 0?1:le(a)}},k=e=>{if(typeof e!=`string`)throw Error(`Invalid Hex color format.`);let t=e.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);if(!t)throw Error(`Invalid Hex color format.`);let n=t[1];n.length!==3&&n.length!==4||(n=n.split(``).map(e=>e+e).join(``));let r=parseInt(n.substring(0,2),16),i=parseInt(n.substring(2,4),16),a=parseInt(n.substring(4,6),16),o=1;if(n.length===8){let e=parseInt(n.substring(6,8),16);o=Number((e/255).toFixed(2))}return{red:r,green:i,blue:a,alpha:o}},fe=e=>{if(typeof e==`string`){if(e.startsWith(`#`))return`hex`;if(e.startsWith(`rgb`))return`rgbString`;if(e.startsWith(`hsl`))return`hslString`}if(typeof e==`object`&&e){if(`red`in e&&`green`in e&&`blue`in e)return`rgb`;if(`hue`in e&&`saturation`in e&&`lightness`in e)return`hsl`}throw Error(`Invalid color format`)},pe=e=>{if(typeof e!=`object`||!e)throw Error(`Invalid color format. Expected an RGB or HSL object.`);if(`red`in e&&`green`in e&&`blue`in e){let{red:t,green:n,blue:r,alpha:i}=e;return i===void 0||i===1?`rgb(${t}, ${n}, ${r})`:`rgba(${t}, ${n}, ${r}, ${i})`}if(`hue`in e&&`saturation`in e&&`lightness`in e){let{hue:t,saturation:n,lightness:r,alpha:i}=e;return i===void 0||i===1?`hsl(${t}, ${n}%, ${r}%)`:`hsla(${t}, ${n}%, ${r}%, ${i})`}throw Error(`Invalid color format. Expected an RGB or HSL object.`)},A=e=>{if(!ae(e))throw Error(`Invalid RGB color format`);let{red:t,green:n,blue:r,alpha:i}=typeof e==`string`?de(e):e,a=t/255,o=n/255,s=r/255,c=Math.max(a,o,s),l=Math.min(a,o,s),u=c-l,d=0,f=0,p=(c+l)/2;if(u!==0){switch(f=p>.5?u/(2-c-l):u/(c+l),c){case a:d=(o-s)/u+(o<s?6:0);break;case o:d=(s-a)/u+2;break;case s:d=(a-o)/u+4}d*=60}return{hue:Math.round(d),saturation:Math.round(100*f),lightness:Math.round(100*p),alpha:i}},me=e=>A(k(e)),he=e=>{let t=fe(e);if(t===`hsl`)return e;if(t===`rgb`)return A(e);if(t===`hex`)return me(e);if(t===`hslString`)return ue(e);if(t===`rgbString`)return A(e);throw Error(`Invalid color format`)},j=e=>pe(he(e)),M=class extends b{theme=`light`;onChangeTheme=T();definedColors={dark:{0:{hue:0,lightness:40,saturation:0},1:{hue:358,lightness:65,saturation:100},2:{hue:23,lightness:63,saturation:86},3:{hue:39,lightness:70,saturation:91},4:{hue:153,lightness:45,saturation:80},5:{hue:217,lightness:62,saturation:100},6:{hue:259,lightness:75,saturation:100}},light:{0:{hue:0,lightness:72,saturation:0},1:{hue:358,lightness:55,saturation:81},2:{hue:19,lightness:58,saturation:87},3:{hue:41,lightness:52,saturation:79},4:{hue:150,lightness:37,saturation:100},5:{hue:221,lightness:59,saturation:100},6:{hue:257,lightness:62,saturation:81}}};namedColors={dark:{background:`rgb(30, 30, 30)`,"background-secondary":`rgb(37, 37, 40)`,border:`hsla(0, 0%, 30%, 0.7)`,dots:`hsla(0, 0%, 40%, 0.3)`,shadow:`0px 0px 8px rgb(0, 0, 0, 0.2)`,text:`rgb(242, 242, 242)`},light:{background:`rgb(250, 250, 250)`,"background-secondary":`rgb(255, 255, 255)`,border:`hsla(0, 0%, 82%, 0.7)`,dots:`hsla(0, 0%, 72%, 0.4)`,shadow:`0px 0px 8px rgb(0, 0, 0, 0.1)`,text:`rgb(30, 30, 30)`}};colorCache={dark:{},light:{}};constructor(...e){super(...e);let t=this.options.colors;t&&[`light`,`dark`].forEach(e=>{if(!(e in t))return;let n=t[e];n&&Object.entries(n).forEach(([t,n])=>{if(!n)return;let r=this.namedColors[e],i=this.definedColors[e];if(t in r)r[t]=n;else if(t in i){let e=this.parseColor(n);if(!e){console.warn(`[JSON Canvas Viewer] Color ${n} unsupported.`);return}i[t]=e}})}),this.changeTheme(this.options.theme??`light`),this.augment({changeTheme:this.changeTheme,onChangeTheme:this.onChangeTheme})}hslProcessor=e=>{let{hue:t,saturation:n,lightness:r}=e,i=this.theme===`dark`?{active:e,background:{...e,alpha:.1},border:{...e,alpha:.7},card:{hue:t,lightness:r/3,saturation:n/3},text:e.lightness>=70?`rgb(30, 30, 30)`:`rgb(242, 242, 242)`}:{active:e,background:{...e,alpha:.1},border:{...e,alpha:.7},card:t===0?{hue:t,lightness:100,saturation:n}:{hue:t,lightness:90,saturation:n*.4},text:e.lightness>=70?`rgb(30, 30, 30)`:`rgb(242, 242, 242)`};return{active:j(i.active),background:j(i.background),border:j(i.border),card:j(i.card),text:i.text}};parseColor=e=>{if(e.startsWith(`rgb`))return A(de(e));if(e.startsWith(`#`))return A(k(e));if(e.startsWith(`hsl`))return ue(e)};getColor=(e=`0`)=>{let t=this.theme,n;if(this.colorCache[t][e])return this.colorCache[t][e];n=e in this.definedColors[t]?this.hslProcessor(this.definedColors[t][e]):this.hslProcessor(A(k(e)));let r={...n,"border-width":e===`0`?`1px`:`2px`};return this.colorCache[t][e]=r,r};getNamedColor=e=>this.namedColors[this.theme][e];changeTheme=e=>{this.theme=e??(this.theme===`dark`?`light`:`dark`);let t=this.container.get(E).data.container;Object.entries(this.namedColors[this.theme]).forEach(([e,n])=>{t.style.setProperty(`--${e}`,n)}),this.onChangeTheme(this.theme)}},N=class extends b{animationId;resizeAnimationId;DM;SM;resizeObserver;perFrame={lastOffsets:{x:0,y:0},lastScale:1};lastResizeCenter={};onResize=T();onRefresh=T();constructor(...e){super(...e),this.DM=this.container.get(E),this.SM=this.container.get(M),this.resizeObserver=new ResizeObserver(this.onResizeCallback),this.SM.onChangeTheme.subscribe(this.refresh),this.augment({onRefresh:this.onRefresh,onResize:this.onResize,refresh:this.refresh}),this.onStart(this.start),this.onRestart(this.refresh),this.onDispose(this.dispose)}start=()=>{this.resizeObserver.observe(this.DM.data.container),this.animationId=requestAnimationFrame(this.draw)};draw=()=>{(this.perFrame.lastScale!==this.DM.data.scale||this.perFrame.lastOffsets.x!==this.DM.data.offsetX||this.perFrame.lastOffsets.y!==this.DM.data.offsetY)&&this.refresh(),this.animationId=requestAnimationFrame(this.draw)};refresh=()=>{this.perFrame={lastOffsets:{x:this.DM.data.offsetX,y:this.DM.data.offsetY},lastScale:this.DM.data.scale},this.onRefresh()};onResizeCallback=()=>{this.resizeAnimationId=requestAnimationFrame(()=>{let e=this.DM.middleViewer();this.lastResizeCenter.x&&this.lastResizeCenter.y&&(this.DM.data.offsetX=this.DM.data.offsetX+e.x-this.lastResizeCenter.x,this.DM.data.offsetY=this.DM.data.offsetY+e.y-this.lastResizeCenter.y),this.lastResizeCenter.x=e.x,this.lastResizeCenter.y=e.y,this.onResize(e.width,e.height),this.refresh()})};dispose=()=>{this.animationId&&cancelAnimationFrame(this.animationId),this.resizeAnimationId&&cancelAnimationFrame(this.resizeAnimationId),this.resizeObserver.disconnect()}},P=class{dispatch;constructor(e,t,n,r,i,a,o,s){this.augment=e,this.getNthPointer=n,this.toTargetCoords=r,this.window=i,this.pointers=a,this.element=o,this.options=s,this.dispatch=t}onPointerDown;onPointerUp;onPointerMove;onWheel;onStart;onStop;dispose;modifiers};function F(e,t=0){return e[e.length-1-t]}function ge(e,t){for(let[n,r]of Object.entries(e))n in t||(t[n]=r)}var _e=class extends P{#e=-1/0;#t=0;onPointerDown=(e,t,n)=>{if(n.size===2){let e=this.getNthPointer(0);e.interrupted=!0,t.interrupted=!0}};onPointerUp=(e,t)=>{if(t.interrupted)return;let n=this.options.clickMoveThreshold??5;if(Math.abs(t.records[0].x-e.clientX)>=n||Math.abs(t.records[0].y-e.clientY)>=n)return;let r=F(t.records).timestamp,i=this.options.clickStreakWindow??400;r-this.#e<=i?this.#t++:this.#t=1,this.#e=r;let a=this.toTargetCoords({x:e.clientX,y:e.clientY});this.dispatch(`trueClick`,{...a,target:t.target,streak:this.#t})}},ve=class extends P{onPointerMove=(e,t,n)=>{let r=F(t.records,1);if(n.size===1){let t=e.clientX-r.x,n=e.clientY-r.y;this.dispatch(`drag`,{deltaX:t,deltaY:n,x:e.clientX,y:e.clientY})}}};-(Math.PI/4)*3,-Math.PI/4,Math.PI/4,Math.PI/4*3,-Math.PI/2,Math.PI/2,-(Math.PI/8)*7,-(Math.PI/8)*5,-(Math.PI/8)*3,-Math.PI/8,Math.PI/8,Math.PI/8*3,Math.PI/8*5,Math.PI/8*7;var ye=class extends P{#e={lastDistance:0,lastMidpoint:{x:0,y:0}};#t(){let e=F(this.getNthPointer(0).records),t=F(this.getNthPointer(1).records),n=e.x-t.x,r=e.y-t.y;return Math.sqrt(n*n+r*r)}#n(){let e=F(this.getNthPointer(0).records),t=F(this.getNthPointer(1).records);return{x:(e.x+t.x)/2,y:(e.y+t.y)/2}}onPointerDown=(e,t,n)=>{n.size===2&&(this.#e.lastDistance=this.#t(),this.#e.lastMidpoint=this.toTargetCoords(this.#n()))};onPointerMove=(e,t,n)=>{if(n.size!==2)return;let r=this.#t(),i=this.#n(),a=r/this.#e.lastDistance;this.#e.lastDistance=r;let o=this.toTargetCoords(i),s=o.x-this.#e.lastMidpoint.x,c=o.y-this.#e.lastMidpoint.y;this.#e.lastMidpoint=o,this.#i({deltaX:s,deltaY:c}),this.#r(a,o)};#r(e,t){e!==1&&this.dispatch(`zoom`,{x:t.x,y:t.y,factor:e})}#i(e){e.deltaX===0&&e.deltaY===0||this.dispatch(`pan`,e)}},be=class extends P{onWheel=e=>e.preventDefault();#e=e=>e.preventDefault();onStart=()=>{this.element.style.touchAction=`none`,this.element.addEventListener(`gesturestart`,this.#e,{passive:!1}),this.element.addEventListener(`gesturechange`,this.#e,{passive:!1})};onStop=()=>{this.element.style.touchAction=``,this.element.removeEventListener(`gesturestart`,this.#e),this.element.removeEventListener(`gesturechange`,this.#e)};dispose=this.onStop},xe=class extends P{constructor(...e){super(...e),ge({proControlSchema:!1,zoomFactor:.1,lockControlSchema:!1},this.options)}onWheel=e=>{let t=this.options;if(!t.proControlSchema&&!t.lockControlSchema&&(e.ctrlKey||e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))&&(t.proControlSchema=!0),t.proControlSchema){if(e.ctrlKey){let n=1-t.zoomFactor*e.deltaY,r=this.toTargetCoords({x:e.clientX,y:e.clientY});this.#e(n,r)}else e.shiftKey&&Math.abs(e.deltaX)<=Math.abs(e.deltaY)?this.#t({deltaX:-e.deltaY,deltaY:-e.deltaX}):this.#t({deltaX:-e.deltaX,deltaY:-e.deltaY})}else{let n=1-t.zoomFactor/20*e.deltaY,r=this.toTargetCoords({x:e.clientX,y:e.clientY});this.#e(n,r)}};#e(e,t){this.dispatch(`zoom`,{x:t.x,y:t.y,factor:e})}#t(e){this.dispatch(`pan`,e)}},Se=class extends P{#e={};#t=null;constructor(...e){super(...e);let t=this.options.lubricator;t&&Object.entries(t).forEach(([e,t])=>{let n={sample:{},fields:{}};Object.keys(t.fields).forEach(e=>{n.fields[e]={catch:1,release:1}}),this.#e[e]=n,this.modifiers[e]=this.#n(n,t)})}onStart=()=>{this.#t=requestAnimationFrame(this.#i)};onStop=()=>{this.#t&&cancelAnimationFrame(this.#t),this.#t=null,Object.values(this.#e).forEach(e=>{Object.values(e.fields).forEach(e=>{e.release=1,e.catch=1})})};#n=(e,t)=>n=>n.lubricated?!0:(e.sample=n,this.#r(e.fields,t.fields,n),!1);#r=(e,t,n)=>{Object.entries(e).forEach(([e,r])=>{if(typeof n[e]!=`number`)return;let i=t[e].countType;i===`sum`?r.catch+=n[e]:i===`product`&&(r.catch*=n[e])})};#i=()=>{let e=this.#e,t=this.options.lubricator;t&&(Object.entries(e).forEach(([e,n])=>{let r=n.sample;r.lubricated=!0;let i=!1;for(let[a,o]of Object.entries(n.fields)){if(o.catch===1)continue;let n=t[e].fields[a].countType,s,c;if(n===`sum`?(c=o.catch-o.release,s=Math.abs(c)):(c=o.catch/o.release,s=this.#a(c)-1),s<=t[e].fields[a].diminishBoundary){i||=!0,r[a]=c,o.release=1,o.catch=1;continue}let l;n===`sum`?(l=c*t[e].decayFactor,o.release+=l):(l=c**+t[e].decayFactor,o.release*=l),r[a]=l,i=!0}i&&this.dispatch(e,r)}),this.#t=requestAnimationFrame(this.#i))};#a=e=>e>1?e:1/e;modifiers={}},I={decayFactor:.25,fields:{deltaX:{countType:`sum`,diminishBoundary:.5},deltaY:{countType:`sum`,diminishBoundary:.5}}},Ce=I,we={decayFactor:.25,fields:{factor:{countType:`product`,diminishBoundary:.01}}},Te=class{#e;#t=new Map;#n={};#r={};#i;#a={};options;get#o(){if(!this.#i)throw Error(`[Pointeract] Window is not defined.`);return this.#i}constructor(e,t){let n=t||[];this.#i=e.element.ownerDocument.defaultView,this.#e=e.element,e.coordinateOutput||=`relative`,this.options=e,n.forEach(t=>{let n=new t(this.#l,this.dispatch,this.#s,this.#c,this.#o,this.#t,this.#e,this.options);Object.assign(n,{options:e}),this.#n[t.name]=n})}on=(e,t)=>(this.#a[e]||(this.#a[e]=new Set),this.#a[e]?.add(t),this);off=(e,t)=>(this.#a[e]?.delete(t),this);#s=e=>{let t=Error(`[Pointeract] Invalid pointer index.`);if(e<0||e>=this.#t.size)throw t;let n=0;for(let t of this.#t.values()){if(n===e)return t;n++}throw t};#c=e=>{if(this.options.coordinateOutput===`absolute`)return e;let t=this.#e.getBoundingClientRect();return e.x-=t.left,e.y-=t.top,this.options.coordinateOutput===`relative`?e:(e.x/=t.width,e.y/=t.height,e)};dispatch=(...e)=>{let t=e[0],n=e[1],r=!0;for(let e of Object.values(this.#n))if(!(!e.modifiers||!(t in e.modifiers))&&(r=n===void 0?e.modifiers[t]():e.modifiers[t](n),r===!1))return;let i;i=r===!0?n:r,this.#a[t]?.forEach(e=>e(i))};#l=e=>{Object.defineProperties(this,Object.getOwnPropertyDescriptors(e))};#u=(e,...t)=>{Object.values(this.#n).forEach(n=>{let r=n[e];r&&r(...t)})};#d=e=>{e.isPrimary&&this.#t.clear();let t={records:[{x:e.clientX,y:e.clientY,timestamp:Date.now()}],target:e.target,index:this.#t.size};this.#t.set(e.pointerId,t),this.#u(`onPointerDown`,e,t,this.#t)};#f=e=>{let t=this.#t.get(e.pointerId);t&&(t.records.push({x:e.clientX,y:e.clientY,timestamp:Date.now()}),this.#u(`onPointerMove`,e,t,this.#t))};#p=e=>{let t=this.#t.get(e.pointerId);t&&(this.#t.delete(e.pointerId),this.#u(`onPointerUp`,e,t,this.#t))};#m=e=>this.#u(`onWheel`,e);stop=e=>{let t=()=>{this.#e.removeEventListener(`pointerdown`,this.#d),this.#o.removeEventListener(`pointermove`,this.#f),this.#o.removeEventListener(`pointerup`,this.#p),this.#e.removeEventListener(`wheel`,this.#m),this.#u(`onStop`)},n=e=>{if(!(e.name in this.#n))return;let t=this.#n[e.name];t.onStop&&t.onStop(),this.#r[e.name]=t,delete this.#n[e.name]};return e?e.forEach(e=>{n(e)}):t(),this};start=e=>{let t=()=>{this.#e.addEventListener(`pointerdown`,this.#d),this.#o.addEventListener(`pointermove`,this.#f),this.#o.addEventListener(`pointerup`,this.#p),this.#e.addEventListener(`wheel`,this.#m,{passive:!1}),this.#u(`onStart`)},n=e=>{if(!(e.name in this.#r))return;let t=this.#r[e.name];t.onStart&&t.onStart(),this.#n[e.name]=t,delete this.#r[e.name]};return e?e.forEach(e=>{n(e)}):t(),this};dispose=()=>{this.stop(),this.#i=null,this.#u(`dispose`),this.#a={}}},L=class extends b{pointeract;DM;onClick=T();constructor(...e){super(...e),this.DM=this.container.get(E);let t=Object.assign(this.options.pointeract??{},{coordinateOutput:`relative`,element:this.DM.data.container,lubricator:{drag:Ce,pan:I,zoom:we}});this.pointeract=new Te(t,[_e,ve,xe,be,ye,Se]);let n=this.container.get(R);n.onInteractionStart.subscribe(this.stopInteract),n.onInteractionEnd.subscribe(this.startInteract),this.augment({pan:this.pan,panToCoords:this.panToCoords,zoom:this.zoom,zoomToScale:this.zoomToScale}),this.onStart(this.start),this.onDispose(this.dispose)}start=()=>{this.pointeract.on(`pan`,this.onPan).on(`drag`,this.onPan).on(`zoom`,this.onZoom).on(`trueClick`,this.onTrueClick).start()};startInteract=()=>{this.pointeract.start()};stopInteract=()=>{this.pointeract.stop()};onPan=e=>{this.truePan({x:e.deltaX,y:e.deltaY})};onZoom=e=>{this.trueZoom(e.factor,e)};trueZoom=(e,t)=>{let n=Math.max(Math.min(this.DM.data.scale*e,20),.05);if(n===this.DM.data.scale)return;let r=n/this.DM.data.scale,i=this.C2C(t);this.DM.data.offsetX=t.x-i.x*r,this.DM.data.offsetY=t.y-i.y*r,this.DM.data.scale=n};truePan=({x:e,y:t})=>{this.DM.data.offsetX+=e,this.DM.data.offsetY+=t};zoom=(e,t)=>{this.pointeract.dispatch(`zoom`,{factor:e,...t})};pan=({x:e,y:t})=>{this.pointeract.dispatch(`pan`,{deltaX:e,deltaY:t})};zoomToScale=(e,t)=>{let n=e/this.DM.data.scale;this.pointeract.dispatch(`zoom`,{factor:n,...t})};panToCoords=({x:e,y:t})=>{this.pointeract.dispatch(`pan`,{deltaX:e-this.DM.data.offsetX,deltaY:t-this.DM.data.offsetY})};C2C=({x:e,y:t})=>({x:e-this.DM.data.offsetX,y:t-this.DM.data.offsetY});onTrueClick=e=>{let t=e.target?e.target:void 0;if(this.isUIControl(t))return;let n=this.findNodeId(t);this.onClick(n)};isUIControl=e=>e?e.closest(`.controls`)||e.closest(`button`)||e.closest(`input`):!1;findNodeId=e=>{if(!e)return;let t=e;for(;(!t.id||t.id===``)&&t.parentElement;)t=t.parentElement;if(!(t.id===`overlays`||!t.id||t.id===``))return t.id};dispose=()=>this.pointeract.dispose()},Ee={audio:/\.(mp3|wav|ogg|opus|aac|m4a|flac)$/i,image:/\.(png|jpg|jpeg|gif|svg|webp|avif|bmp|ico|heic|heif)$/i,markdown:/\.(md|mdx|markdown|txt)$/i,video:/\.(mp4|webm|ogv|mov|m3u8|mpd)$/i},De=[`markdown`,`image`,`audio`,`video`],R=class extends b{_overlaysLayer=document.createElement(`div`);overlays={};selectedId;aborted=!1;eventListeners={};DM;SM;parse;componentDict={audio:({container:e,content:t})=>{let n=document.createElement(`audio`);n.className=`JCV-audio`,n.src=t,n.controls=!0,e.appendChild(n)},image:({container:e,content:t})=>{let n=document.createElement(`img`);n.className=`JCV-img`,n.src=t,n.loading=`lazy`,e.appendChild(n)},link:({container:e,content:t})=>{let n=document.createElement(`iframe`);n.src=t,n.sandbox=`allow-scripts allow-same-origin`,n.className=`JCV-link-iframe`,n.loading=`lazy`,e.appendChild(n)},markdown:async({container:e,content:t})=>{e.classList.add(`JCV-markdown-content`);let n=document.createElement(`div`);n.textContent=`Loading...`,n.classList.add(`JCV-parsed-content-wrapper`),e.appendChild(n);let r;try{let e=await(await fetch(t)).text(),n=/^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(e);r=await this.parse(n?n[2]:e)}catch(e){console.error(`[JSON Canvas Viewer] Failed to load markdown:`,e),r=`Failed to load content.`}n.innerHTML=r},text:({container:e,content:t})=>{e.classList.add(`JCV-markdown-content`);let n=document.createElement(`div`);n.innerHTML=t,n.classList.add(`JCV-parsed-content-wrapper`),e.appendChild(n)},video:({container:e,content:t})=>{let n=document.createElement(`video`);n.className=`JCV-video`,n.src=t,n.controls=!0,e.appendChild(n)}};get overlaysLayer(){if(!this._overlaysLayer)throw x;return this._overlaysLayer}onInteractionStart=T();onInteractionEnd=T();onNodeActive=T();onNodeLosesActive=T();constructor(...e){super(...e),this.parse=this.options.parser??(e=>e),this.DM=this.container.get(E),this.SM=this.container.get(M),this.container.get(N).onRefresh.subscribe(this.updateOverlays),this.SM.onChangeTheme.subscribe(this.themeChanged),this._overlaysLayer=document.createElement(`div`),this._overlaysLayer.className=`JCV-overlays`,this._overlaysLayer.id=`overlays`,this.DM.data.container.appendChild(this.overlaysLayer);let t=this.options.nodeComponents;t&&Object.assign(this.componentDict,t),this.augment({onNodeActive:this.onNodeActive,onNodeLosesActive:this.onNodeLosesActive}),this.onStart(this.start),this.onRestart(this.restart),this.onDispose(this.dispose)}start=()=>{this.container.get(L).onClick.subscribe(this.select),this.renderOverlays()};restart=()=>{this.clearOverlays(),this.renderOverlays()};renderOverlays=()=>{let e=async({ref:e,fileName:t})=>{switch(e.type){case`text`:this.createOverlay(e,await this.parse(e.text),`text`);break;case`file`:for(let n of De)if(t?.match(Ee[n])){this.createOverlay(e,e.file,n);break}break;case`link`:this.createOverlay(e,e.url,`link`)}};Object.values(this.DM.data.nodeMap).forEach(async t=>await e(t))};themeChanged=()=>{Object.values(this.overlays).forEach(e=>{let t=this.DM.data.nodeMap[e.id].ref,n=this.SM.getColor(t.color);this.setOverlayColor(e,n)})};select=e=>{let t=this.selectedId,n=t?this.overlays[t]:void 0,r=e?this.overlays[e]:void 0;if(n&&t){n.classList.remove(`JCV-active`);let e=this.DM.data.nodeMap[t];this.onNodeLosesActive(e.ref),e.onLoseActive?.()}if(r&&e){r.classList.add(`JCV-active`),this.onInteractionStart();let t=this.DM.data.nodeMap[e];this.onNodeActive(t.ref),t.onActive?.()}else this.onInteractionEnd();this.selectedId=e};updateOverlays=()=>{let e=this.DM.data;this.overlaysLayer.style.transform=`translate(${e.offsetX}px, ${e.offsetY}px) scale(${e.scale})`};createOverlay=(...e)=>{if(this.aborted)return;let t=e[0],n=this.overlays[t.id];if(!n){if(n=this.constructOverlay(...e),this.aborted)return;this.overlaysLayer.appendChild(n),this.overlays[t.id]=n,n.style.left=`${t.x}px`,n.style.top=`${t.y}px`,n.style.width=`${t.width}px`,n.style.height=`${t.height}px`}};constructOverlay=(...e)=>{let t=e[0],n=document.createElement(`div`);n.classList.add(`JCV-overlay-container`),n.id=t.id,this.setOverlayColor(n,this.SM.getColor(t.color));let r=document.createElement(`div`);r.classList.add(`JCV-content`),n.appendChild(r);let i=document.createElement(`div`);i.className=`JCV-click-layer`,n.appendChild(i);let a=document.createElement(`div`);a.className=`JCV-overlay-border`,n.appendChild(a);let o=this.DM.data.nodeMap[t.id];o.onActive=T(),o.onLoseActive=T(),o.onBeforeUnmount=T(),this.componentDict[e[2]]({container:r,content:e[1],node:e[0],onActive:o.onActive,onBeforeUnmount:o.onBeforeUnmount,onLoseActive:o.onLoseActive});let s=()=>{t.id===this.selectedId&&this.onInteractionStart()},c=()=>{t.id===this.selectedId&&this.onInteractionEnd()};return n.addEventListener(`pointerenter`,s),n.addEventListener(`pointerleave`,c),n.addEventListener(`touchstart`,s),n.addEventListener(`touchend`,c),this.eventListeners[t.id]=[s,c],n};setOverlayColor=(e,t)=>{Object.entries(t).forEach(([t,n])=>{e.style.setProperty(`--overlay-${t}`,n)})};clearOverlays=()=>{Object.entries(this.overlays).forEach(([e,t])=>{if(this.DM.data.nodeMap[e].onBeforeUnmount?.(),this.eventListeners[e]){let n=this.eventListeners[e][0],r=this.eventListeners[e][1];if(!n||!r)throw x;t.removeEventListener(`pointerenter`,n),t.removeEventListener(`pointerleave`,r),t.removeEventListener(`touchstart`,n),t.removeEventListener(`touchend`,r),this.eventListeners[e][0]=void 0,this.eventListeners[e][1]=void 0}t.remove(),delete this.overlays[e]})};dispose=()=>{this.aborted=!0,this.clearOverlays(),this.overlaysLayer.remove(),this._overlaysLayer=void 0}},Oe=class extends b{_canvas;ctx;DM;SM;get canvas(){if(!this._canvas)throw x;return this._canvas}constructor(...e){super(...e);let t=this.container.get(N);this.SM=this.container.get(M),t.onRefresh.subscribe(this.redraw),t.onResize.subscribe(this.optimizeDPR),this.DM=this.container.get(E),this._canvas=document.createElement(`canvas`),this._canvas.className=`JCV-main-canvas`,this.ctx=this._canvas.getContext(`2d`),this.DM.data.container.appendChild(this._canvas),this.onDispose(this.dispose)}optimizeDPR=()=>{let e=this.DM.data.container;re(this.canvas,e.offsetWidth,e.offsetHeight)};redraw=()=>{let e=this.DM.data.offsetX,t=this.DM.data.offsetY,n=this.DM.data.scale,r=this.getCurrentViewport(e,t,n);this.canvas.style.transform=``,this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.ctx.save(),this.drawGridDots(n,e,t),this.ctx.translate(e,t),this.ctx.scale(n,n),Object.values(this.DM.data.nodeMap).forEach(e=>{if(this.isOutside(e.box,r))return;let t=e.ref;t.type===`file`?this.drawFile(e):t.type===`group`&&this.drawGroup(t,n)}),Object.values(this.DM.data.edgeMap).forEach(e=>{this.isOutside(e.box,r)||this.drawEdge(e)}),this.ctx.restore()};isInside=(e,t)=>e.left>t.left&&e.top>t.top&&e.right<t.right&&e.bottom<t.bottom;isOutside=(e,t)=>e.right<t.left||e.bottom<t.top||e.left>t.right||e.top>t.bottom;getCurrentViewport=(e,t,n)=>{let r=-e/n,i=-t/n,a=this.DM.data.container,o=r+a.clientWidth/n;return{bottom:i+a.clientHeight/n,left:r,right:o,top:i}};drawLabelBar=(e,t,n,r,i,a)=>{let o=30*a,s=6*a,c=8*a,l=16*a,u=6*a;this.ctx.save(),this.ctx.translate(e,t),this.ctx.scale(1/a,1/a),this.ctx.font=`${l}px 'Inter', sans-serif`;let d=this.ctx.measureText(n).width+2*u;this.ctx.translate(0,-o-c),this.ctx.fillStyle=r,this.ctx.beginPath(),this.ctx.moveTo(s,0),this.ctx.lineTo(d-s,0),this.ctx.quadraticCurveTo(d,0,d,s),this.ctx.lineTo(d,o-s),this.ctx.quadraticCurveTo(d,o,d-s,o),this.ctx.lineTo(s,o),this.ctx.quadraticCurveTo(0,o,0,o-s),this.ctx.lineTo(0,s),this.ctx.quadraticCurveTo(0,0,s,0),this.ctx.closePath(),this.ctx.fill(),this.ctx.fillStyle=i,this.ctx.fillText(n,u,o*.65),this.ctx.restore()};drawNodeBackground=e=>{let t=this.SM.getColor(e.color);this.ctx.globalAlpha=1,this.ctx.fillStyle=t.background,C(this.ctx,e.x+1,e.y+1,e.width-2,e.height-2,12),this.ctx.fill(),this.ctx.strokeStyle=t.border,this.ctx.lineWidth=2,C(this.ctx,e.x,e.y,e.width,e.height,12),this.ctx.stroke()};drawGroup=(e,t)=>{if(this.drawNodeBackground(e),e.label){let n=this.SM.getColor(e.color);this.drawLabelBar(e.x,e.y,e.label,n.active,n.text,t)}};drawFile=e=>{this.ctx.fillStyle=this.SM.getColor().text;let t=e.ref;this.ctx.font=`16px sans-serif`,this.ctx.fillText(e.fileName??``,t.x+5,t.y-10)};drawEdge=e=>{let t=e.ref,n=this.DM.data.nodeMap[t.fromNode].ref,r=this.DM.data.nodeMap[t.toNode].ref,{x:i,y:a}=w(n,t.fromSide),{x:o,y:s}=w(r,t.toSide),c=this.SM.getColor(t.color),l,u,d,f;e.controlPoints?[l,u,d,f]=e.controlPoints:([l,u,d,f]=this.getControlPoints(i,a,o,s,t.fromSide,t.toSide),e.controlPoints=[l,u,d,f]),this.drawCurvedPath(i,a,o,s,l,u,d,f,c.active),this.drawArrowhead(o,s,d,f,c.active),t.label&&this.drawEdgeLabel(i,a,o,s,l,u,d,f,t.label,c.active,c.text)};drawEdgeLabel=(e,t,n,r,i,a,o,s,c,l,u)=>{let d=.5,f=.5**3*e+3*.5**2*d*i+1.5*d*d*o+d**3*n,p=.5**3*t+3*.5**2*d*a+1.5*d*d*s+d**3*r;this.ctx.font=`18px sans-serif`;let m=c.split(`
`),h=0;for(let e of m){let t=this.ctx.measureText(e).width;t>h&&(h=t)}let g=h+16,_=m.length*17+6;this.ctx.fillStyle=l,this.ctx.beginPath(),C(this.ctx,f-g/2,p-_/2-2,g,_,4),this.ctx.fill(),this.ctx.fillStyle=u,this.ctx.textAlign=`center`,this.ctx.textBaseline=`middle`;for(let e=0;e<m.length;e++){let t=(e-(m.length-1)/2)*17;this.ctx.fillText(m[e],f,p-2+t)}this.ctx.textAlign=`left`,this.ctx.textBaseline=`alphabetic`};getControlPoints=(e,t,n,r,i,a)=>{let o=n-e,s=r-t,c=((e,t,n)=>Math.max(t,Math.min(n,e)))((Math.min(Math.abs(o),Math.abs(s))+.3*Math.max(Math.abs(o),Math.abs(s)))*.5,60,300),l=e,u=t,d=n,f=r;switch(i){case`top`:u=t-c;break;case`bottom`:u=t+c;break;case`left`:l=e-c;break;case`right`:l=e+c}switch(a){case`top`:f=r-c;break;case`bottom`:f=r+c;break;case`left`:d=n-c;break;case`right`:d=n+c}return[l,u,d,f]};drawGridDots=(e,t,n)=>{let r=10*2**-Math.floor(Math.log2(e))*e,i=this.canvas.width,a=this.canvas.height,o=t%r,s=n%r;this.ctx.fillStyle=this.SM.getNamedColor(`dots`);for(let e=o;e<=i;e+=r)for(let t=s;t<=a;t+=r)this.ctx.beginPath(),this.ctx.arc(e,t,1,0,2*Math.PI),this.ctx.fill()};drawCurvedPath=(e,t,n,r,i,a,o,s,c)=>{this.ctx.beginPath(),this.ctx.moveTo(e,t),this.ctx.bezierCurveTo(i,a,o,s,n,r),this.ctx.strokeStyle=c,this.ctx.lineWidth=2,this.ctx.stroke()};drawArrowhead=(e,t,n,r,i)=>{let a=e-n,o=t-r,s=Math.sqrt(a*a+o*o);if(s===0)return;let c=a/s,l=o/s,u=e-c*12-l*4,d=t-l*12+c*4,f=e-c*12+l*4,p=t-l*12-c*4;this.ctx.beginPath(),this.ctx.fillStyle=i,this.ctx.moveTo(e,t),this.ctx.lineTo(u,d),this.ctx.lineTo(f,p),this.ctx.closePath(),this.ctx.fill()};dispose=()=>{this.canvas.remove(),this._canvas=void 0}};function z(e){return typeof e==`function`}function ke(e){let t=[],n=e;for(;Object.getPrototypeOf(n).name;){let e=Object.getPrototypeOf(n);t.push(e),n=e}return t}function Ae(e){return e.flat(1/0)}function B(e){if(e==null)throw Error(`Expected value to be not null or undefined`);return e}function je(e,t=2){let n=[];return e.some((r,i)=>{if(i+t>e.length)return!0;n.push(e.slice(i,i+t))}),n}async function Me(e,t,n){for(;;)try{return await t()}catch(t){if(!(t instanceof e))throw t;await n(t)}}function V(e,t){if(e.length>1)throw t();let n=e.at(0);if(n===void 0)throw t();return n}function Ne(e){throw Error(`invalid state`)}async function H(e){return await new Promise(t=>t(e()))}function U(e){return z(e)}function W(e){return`provide`in e&&`useClass`in e}function Pe(e){return`provide`in e&&`useValue`in e}function G(e){return`provide`in e&&`useFactory`in e}function K(e){return G(e)&&e.async===!0}function q(e){return`provide`in e&&`useExisting`in e}function J(e){return`provide`in e&&`multi`in e&&e.multi===!0}var Y=class{description;options;constructor(e,t){this.description=e,this.options=t}toString(){return`InjectionToken "${String(this.description)}"`}};function Fe(e){return z(e)}function Ie(e){return e instanceof Y}function X(e){return z(e)?e.name:typeof e==`symbol`?e.description??String(e):e instanceof Y?e.toString():e}function Le(e){return U(e)?e:e.provide}var Re=Symbol(`injectable`);function ze(e){return e.hasOwnProperty(Re)}function Be(e){return e[Re]}var Ve=Object.freeze([]),He=class{chain=Ve;run(){throw new Ge}runAsync(){throw new Ge}},Ue=class{container;chain;constructor(e,t){this.container=e,this.chain=t}run(e){let t=Z;try{return Z=this,e(this.container)}finally{Z=t}}runAsync(e){let t=Z;try{return Z=this,H(()=>e(this.container))}finally{Z=t}}},Z=new He;function We(e,t=Ve){return new Ue(e,t)}function Q(){return Z.chain}var Ge=class extends Error{constructor(){super(`You can only invoke inject() or injectAsync() within an injection context. If you entered one using container.runInInjectionContext(), note that it is no longer active after its first await. See https://needle-di.io/concepts/injection.html#running-in-an-injection-context`)}};function $(e,t){if(e.includes(t))throw new Ye([...e,t].map(Le).map(X))}function Ke(e,t){return $(e,t),[...e,t]}var qe=class{container;constructor(e){this.container=e}construct(e,t,n){if(K(e))throw new Je(t);return this.doConstruct(e,Ke(n,e))}async constructAsync(e,t){let n=Ke(t,e);if(K(e))return[await this.enter(n).runAsync(()=>e.useFactory(this.container))];if(W(e)||U(e)){let t=U(e)?()=>[new e]:()=>[new e.useClass];return Me(Je,async()=>this.enter(n).run(()=>t()),async e=>{await this.enter(n).runAsync(()=>this.container.getAsync(e.token,{multi:!0,optional:!0}))})}return q(e)?await this.enter(n).runAsync(()=>this.container.getAsync(e.useExisting,{multi:!0})):this.doConstruct(e,n)}doConstruct(e,t){return this.enter(t).run(()=>U(e)?[new e]:W(e)?[new e.useClass]:Pe(e)?[e.useValue]:G(e)?[e.useFactory(this.container)]:q(e)?this.container.get(e.useExisting,{multi:!0}):Ne(e))}enter(e){return We(this.container,e)}},Je=class extends Error{token;constructor(e){super(`Some providers for token ${X(e)} are async, please use injectAsync() or container.getAsync() instead`),this.token=e}},Ye=class extends Error{constructor(e){super(`Detected circular dependency: ${e.join(` -> `)}. Please change your dependency graph or use lazy injection instead.`)}},Xe=class e{providers=new Map;singletons=new Map;pending=new Map;parent;factory;constructor(t){this.parent=t,this.factory=new qe(this),this.bind({provide:e,useValue:this})}bindAll(...e){return Ae(e).forEach(e=>this.bind(e)),this}bind(e){let t=Le(e);if(q(e)&&e.provide===e.useExisting)throw Error(`The provider for token ${X(t)} with "useExisting" cannot refer to itself.`);if(!q(e)&&this.singletons.has(t))throw Error(`Cannot bind a new provider for ${X(t)}, since the existing provider was already constructed.`);if(q(e)&&J(e)&&this.existingProviderAlreadyProvided(t,e.useExisting))return this;let n=this.providers.get(t)??[],r=J(e);if(r&&n.some(e=>!J(e)))throw Error(`Cannot bind ${X(t)} as multi-provider, since there is already a provider which is not a multi-provider.`);if(!r&&n.some(e=>J(e))&&!n.every(q))throw Error(`Cannot bind ${X(t)} as provider, since there are already provider(s) that are multi-providers.`);return this.providers.set(t,r?[...n,e]:[e]),Fe(t)&&(W(e)||U(e))&&je([t,...ke(t)]).forEach(([e,t])=>{let n={provide:t,useExisting:e,multi:!0},r=this.providers.get(t)??[];this.existingProviderAlreadyProvided(t,e)||this.providers.set(t,[...r,n])}),this}unbind(e){return this.providers.delete(e),this.singletons.delete(e),this.pending.delete(e),this}unbindAll(){return this.providers.clear(),this.singletons.clear(),this.pending.clear(),this}get(e,t){if(t?.lazy??!1)return()=>this.get(e,{...t,lazy:!1});let n=Q();this.autoBindIfNeeded(e);let r=t?.optional??!1;if(!this.providers.has(e)){if(this.parent)return this.parent.get(e,{...t,lazy:!1});if(r)return;throw Error(`No provider(s) found for ${X(e)}`)}let i=B(this.providers.get(e));if(!this.singletons.has(e)){let t=i.flatMap(t=>this.factory.construct(t,e,n));this.singletons.set(e,t)}let a=B(this.singletons.get(e));return t?.multi??!1?a:V(a,()=>Error(`Requesting a single value for ${X(e)}, but multiple values were provided. Consider passing "{ multi: true }" to inject all values, or adjust your bindings accordingly.`))}getAsync(e,t){if(t?.lazy??!1)return()=>this.getAsync(e,{...t,lazy:!1});let n=Q();return H(async()=>{this.autoBindIfNeeded(e);let r=t?.optional??!1;if(!this.providers.has(e)){if(this.parent)return this.parent.getAsync(e,{...t,lazy:!1});if(r)return;throw Error(`No provider(s) found for ${X(e)}`)}let i=B(this.providers.get(e)),a=this.singletons.get(e);return a||=(i.forEach(e=>$(n,e)),await this.constructOnce(e,i,n)),t?.multi??!1?a:V(a,()=>Error(`Requesting a single value for ${X(e)}, but multiple values were provided. Consider passing "{ multi: true }" to inject all values, or adjust your bindings accordingly.`))})}runInInjectionContext(e){return We(this,Q()).run(e)}createChild(){return new e(this)}has(e){return this.providers.has(e)||(this.parent?.has(e)??!1)}constructOnce(e,t,n){let r=this.pending.get(e);if(r)return r;let i=H(async()=>(await Promise.all(t.map(e=>this.factory.constructAsync(e,n)))).flat());this.pending.set(e,i);let a=()=>this.pending.get(e)===i;return i.then(t=>{a()&&(this.pending.delete(e),this.singletons.set(e,t))},()=>{a()&&this.pending.delete(e)}),i}autoBindIfNeeded(e){if(!this.singletons.has(e)){if(Fe(e)&&ze(e))Be(e).filter(e=>!this.providers.has(e)).forEach(e=>{this.bind({provide:e,useClass:e,multi:!0})});else if(!this.providers.has(e)&&Ie(e)&&e.options?.factory){let t=e.options.async;t?t&&this.bind({provide:e,async:!0,useFactory:e.options.factory}):this.bind({provide:e,async:!1,useFactory:e.options.factory})}}}existingProviderAlreadyProvided(e,t){return(this.providers.get(e)??[]).some(n=>q(n)&&n.provide===e&&n.useExisting===t)}},Ze=[E,M,N,R,L,Oe],Qe=class{allModules;IO;started=!1;disposed=!1;options;container;onDispose=T(!0);onStart=T();onRestart=T();constructor(e,t){this.container=new Xe,this.options=e;let n=e=>{this.container.bind({provide:e,useFactory:()=>new e(this.container,this.options,this.onStart,this.onDispose,this.onRestart,this.augment)})};this.allModules=[...Ze,...t??[]],this.allModules.forEach(n),this.allModules.forEach(e=>{this.container.get(e)});let r=this.options.loading??`normal`;r===`normal`?this.load():r===`lazy`&&(this.IO=new IntersectionObserver(this.onVisibilityCheck,{rootMargin:`50px`,threshold:0}),this.IO.observe(this.options.container))}onVisibilityCheck=e=>{e.forEach(e=>{if(e.isIntersecting){this.load(),this.IO?.disconnect(),this.IO=void 0;return}})};augment=e=>{let t=Object.getOwnPropertyDescriptors(e);Object.defineProperties(this,t)};load=e=>{this.disposed||(e&&Object.assign(this.options,e),this.started?this.onRestart():(this.onStart(),this.started=!0))};dispose=()=>{if(!this.started||this.disposed)return;this.IO?.disconnect(),this.IO=void 0;let e=this.options.container;for(;e.firstChild;)e.firstChild.remove();this.onDispose(),this.container.unbindAll(),this.disposed=!0}};async function $e(e){let t=async t=>await et(t,e.parser??(e=>e)),n=e.canvas.nodes??[];n.forEach(t=>{if(t.type!==`file`||t.file.includes(`://`))return;let n=e.attachments?.[t.file];n&&(t.file=n)});let r=[];return await Promise.all(n.map(async e=>r.push(await t(e)))),r.join(``)}async function et(e,t){switch(e.type){case`text`:return await t(e.text);case`file`:return await tt(e,t);case`link`:return`<a href="${e.url}" target="_blank" rel="nofollow">${e.url}</a>`;default:return``}}async function tt(e,t){return/\.md$/i.exec(e.file)?await nt(e.file,t):/\.(png|jpg|jpeg|gif|svg|webp)$/i.exec(e.file)?`<img src="${e.file}" alt="${e.file.split(`/`).pop()}">`:/\.(mp3|wav)$/i.exec(e.file)?`<audio src="${e.file}" controls></audio>`:``}async function nt(e,t){let n;try{let r=await(await fetch(e)).text(),i=/^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(r);n=await t(i?i[2]:r)}catch{n=`Failed to load content.`}return n}var rt=`.JSON-Canvas-Viewer > .JCV-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  transition: transform 200ms;
  border-radius: 8px;
  gap: 10px;
}
.JSON-Canvas-Viewer > .JCV-controls.JCV-collapsed {
  transform: translateX(calc(100% - 30px));
}
.JSON-Canvas-Viewer > .JCV-controls .JCV-controls-content {
  display: flex;
  gap: 1px;
  align-items: center;
  border-radius: 8px;
  overflow: hidden;
  background: var(--border);
  box-shadow: var(--shadow);
  outline: 1px solid var(--border);
}
.JSON-Canvas-Viewer > .JCV-controls .JCV-zoom-slider {
  width: 100px;
  margin: 0 10px;
}
`,it=`<svg viewBox="-5.28 -5.28 34.56 34.56" fill="none"><path d="M4 9V5.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C4.76 4 5.04 4 5.6 4H9M4 15v3.4c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C4.76 20 5.04 20 5.6 20H9m6-16h3.4c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C20 4.76 20 5.04 20 5.6V9m0 6v3.4c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C19.24 20 18.96 20 18.4 20H15" stroke-width="2.4" stroke-linecap="round"/></svg>`,at=class extends b{_controlsPanel;_toggleCollapseBtn;_toggleFullscreenBtn;_zoomOutBtn;_zoomSlider;_zoomInBtn;_resetViewBtn;DM;IH;collapsed;get controlsPanel(){if(!this._controlsPanel)throw x;return this._controlsPanel}get toggleCollapseBtn(){if(!this._toggleCollapseBtn)throw x;return this._toggleCollapseBtn}get toggleFullscreenBtn(){if(!this._toggleFullscreenBtn)throw x;return this._toggleFullscreenBtn}get zoomOutBtn(){if(!this._zoomOutBtn)throw x;return this._zoomOutBtn}get zoomSlider(){if(!this._zoomSlider)throw x;return this._zoomSlider}get zoomInBtn(){if(!this._zoomInBtn)throw x;return this._zoomInBtn}get resetViewBtn(){if(!this._resetViewBtn)throw x;return this._resetViewBtn}constructor(...e){super(...e),this.collapsed=this.options.controlsCollapsed??!1,this.DM=this.container.get(E),this.IH=this.container.get(L),this.DM.onToggleFullscreen.subscribe(this.updateFullscreenBtn),this.container.get(N).onRefresh.subscribe(this.updateSlider),this._controlsPanel=document.createElement(`div`),this._controlsPanel.className=`JCV-controls`,this._controlsPanel.classList.toggle(`JCV-collapsed`,this.collapsed),S(this._controlsPanel,rt),this._toggleCollapseBtn=document.createElement(`button`),this._toggleCollapseBtn.className=`JCV-button JCV-collapse-button JCV-border-shadow-bg`,this._toggleCollapseBtn.innerHTML=`<svg viewBox="-3.6 -3.6 31.2 31.2" stroke-width=".4"><path d="M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0Z" /></svg>`,this._controlsPanel.appendChild(this._toggleCollapseBtn);let t=document.createElement(`div`);t.className=`JCV-controls-content`,this._toggleFullscreenBtn=document.createElement(`button`),this._toggleFullscreenBtn.className=`JCV-button`,this._toggleFullscreenBtn.innerHTML=it,t.appendChild(this._toggleFullscreenBtn),this._zoomOutBtn=document.createElement(`button`),this.zoomOutBtn.className=`JCV-button`,this._zoomOutBtn.innerHTML=`<svg viewBox="-1.2 -1.2 26.4 26.4"><path d="M6 12h12" stroke-width="2" stroke-linecap="round" /></svg>`,t.appendChild(this._zoomOutBtn),this._zoomSlider=document.createElement(`input`),this._zoomSlider.type=`range`,this._zoomSlider.className=`JCV-zoom-slider`,this._zoomSlider.min=`-30`,this._zoomSlider.max=`30`,this._zoomSlider.value=`0`,t.appendChild(this._zoomSlider),this._zoomInBtn=document.createElement(`button`),this._zoomInBtn.className=`JCV-button`,this._zoomInBtn.innerHTML=`<svg viewBox="-1.2 -1.2 26.4 26.4"><path d="M6 12h12m-6-6v12" stroke-width="2" stroke-linecap="round" /></svg>`,t.appendChild(this._zoomInBtn),this._resetViewBtn=document.createElement(`button`),this._resetViewBtn.className=`JCV-button`,this._resetViewBtn.innerHTML=`<svg viewBox="-6 -6 30 30" stroke-width=".08"><path d="m14.955 7.986.116.01a1 1 0 0 1 .85 1.13 8 8 0 0 1-13.374 4.728l-.84.84c-.63.63-1.707.184-1.707-.707V10h3.987c.89 0 1.337 1.077.707 1.707l-.731.731a6 6 0 0 0 8.347-.264 6 6 0 0 0 1.63-3.33 1 1 0 0 1 1.131-.848zM11.514.813a8 8 0 0 1 1.942 1.336l.837-.837c.63-.63 1.707-.184 1.707.707V6h-3.981c-.89 0-1.337-1.077-.707-1.707l.728-.729a6 6 0 0 0-9.98 3.591 1 1 0 1 1-1.98-.281A8 8 0 0 1 11.514.813Z" /></svg>`,t.appendChild(this._resetViewBtn),this._controlsPanel.appendChild(t),this.DM.data.container.appendChild(this._controlsPanel),this._toggleCollapseBtn.addEventListener(`click`,this.toggleCollapse),this._zoomInBtn.addEventListener(`click`,this.zoomIn),this._zoomOutBtn.addEventListener(`click`,this.zoomOut),this._zoomSlider.addEventListener(`input`,this.slide),this._resetViewBtn.addEventListener(`click`,this.DM.resetView),this._toggleFullscreenBtn.addEventListener(`click`,this.toggleFullscreen),this.augment({toggleControlsCollapse:this.toggleCollapse}),this.onDispose(this.dispose)}toggleCollapse=()=>{this.collapsed=!this.collapsed,this.controlsPanel.classList.toggle(`JCV-collapsed`,this.collapsed),this.collapsed||this.updateSlider()};zoomIn=()=>this.IH.zoom(1.3,this.DM.middleViewer());zoomOut=()=>this.IH.zoom(1/1.3,this.DM.middleViewer());slide=()=>this.IH.trueZoom(1.1**Number(this.zoomSlider.value)/this.DM.data.scale,this.DM.middleViewer());updateFullscreenBtn=e=>{this.toggleFullscreenBtn.innerHTML=e===`enter`?`<svg viewBox="-40.32 -40.32 176.64 176.64"><path d="M30 60H6a6 6 0 0 0 0 12h18v18a6 6 0 0 0 12 0V66a5.997 5.997 0 0 0-6-6Zm60 0H66a5.997 5.997 0 0 0-6 6v24a6 6 0 0 0 12 0V72h18a6 6 0 0 0 0-12ZM66 36h24a6 6 0 0 0 0-12H72V6a6 6 0 0 0-12 0v24a5.997 5.997 0 0 0 6 6ZM30 0a5.997 5.997 0 0 0-6 6v18H6a6 6 0 0 0 0 12h24a5.997 5.997 0 0 0 6-6V6a5.997 5.997 0 0 0-6-6Z"/></svg>`:it};toggleFullscreen=()=>this.DM.toggleFullscreen();updateSlider=()=>{this.collapsed||(this.zoomSlider.value=String(this.scaleToSlider(this.DM.data.scale)))};scaleToSlider=e=>Math.log(e)/Math.log(1.1);dispose=()=>{this.toggleCollapseBtn.removeEventListener(`click`,this.toggleCollapse),this.zoomInBtn.removeEventListener(`click`,this.zoomIn),this.zoomOutBtn.removeEventListener(`click`,this.zoomOut),this.zoomSlider.removeEventListener(`input`,this.slide),this.resetViewBtn.removeEventListener(`click`,this.DM.resetView),this.toggleFullscreenBtn.removeEventListener(`click`,this.toggleFullscreen),this.controlsPanel.remove(),this._controlsPanel=void 0,this._toggleCollapseBtn=void 0,this._zoomInBtn=void 0,this._zoomOutBtn=void 0,this._zoomSlider=void 0,this._resetViewBtn=void 0,this._toggleFullscreenBtn=void 0}},ot=`.JSON-Canvas-Viewer > .JCV-minimap-container {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  pointer-events: none;
  transition: transform 200ms;
}
.JSON-Canvas-Viewer > .JCV-minimap-container.JCV-collapsed {
  transform: translateX(calc(100% - 30px));
}
.JSON-Canvas-Viewer > .JCV-minimap-container .JCV-toggle-minimap {
  margin: auto 10px 0 0;
  pointer-events: auto;
}
.JSON-Canvas-Viewer > .JCV-minimap-container .JCV-minimap {
  position: relative;
  pointer-events: none;
  width: 200px;
  height: 150px;
  overflow: hidden;
  border-radius: 12px;
  transform-origin: 0 0;
}
.JSON-Canvas-Viewer > .JCV-minimap-container .JCV-minimap .JCV-minimap-canvas {
  width: 100%;
  height: 100%;
}
.JSON-Canvas-Viewer > .JCV-minimap-container .JCV-minimap .JCV-viewport-rectangle {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 6px;
  box-sizing: border-box;
  border: 2px dashed var(--text);
}
@container (max-width: 768px) {
  .JSON-Canvas-Viewer > .JCV-minimap-container .JCV-container .JCV-minimap {
    transform: scale(0.6);
  }
  .JSON-Canvas-Viewer > .JCV-minimap-container .JCV-container .JCV-toggle-minimap {
    transform: translateY(-60px);
  }
  .collapsed .JSON-Canvas-Viewer > .JCV-minimap-container .JCV-container .JCV-toggle-minimap {
    transform: translateY(-60px) rotate(180deg);
  }
  .JSON-Canvas-Viewer > .JCV-minimap-container .JCV-container .JCV-minimap-container {
    transform: translateY(60px) translateX(80px);
  }
  .JSON-Canvas-Viewer > .JCV-minimap-container .JCV-container .JCV-minimap-container.JCV-collapsed {
    transform: translateY(60px) translateX(calc(100% - 32px));
  }
}
`,st=class extends b{_minimapCtx;_viewportRectangle;_minimap;_minimapContainer;_toggleMinimapBtn;minimapCache={centerX:0,centerY:0,scale:1};DM;SM;collapsed;get minimap(){if(!this._minimap)throw x;return this._minimap}get minimapCtx(){if(!this._minimapCtx)throw x;return this._minimapCtx}get viewportRectangle(){if(!this._viewportRectangle)throw x;return this._viewportRectangle}get minimapContainer(){if(!this._minimapContainer)throw x;return this._minimapContainer}get toggleMinimapBtn(){if(!this._toggleMinimapBtn)throw x;return this._toggleMinimapBtn}constructor(...e){super(...e),this.collapsed=this.options.minimapCollapsed??!1,this.container.get(N).onRefresh.subscribe(this.updateViewportRectangle),this.DM=this.container.get(E),this.SM=this.container.get(M),this._minimapContainer=document.createElement(`div`),this._minimapContainer.className=`JCV-minimap-container`,S(this._minimapContainer,ot),this._toggleMinimapBtn=document.createElement(`button`),this._toggleMinimapBtn.className=`JCV-button JCV-toggle-minimap JCV-collapse-button JCV-border-shadow-bg`,this._toggleMinimapBtn.innerHTML=`<svg viewBox="-3.6 -3.6 31.2 31.2" stroke-width=".4"><path d="M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0Z" /></svg>`,this._minimapContainer.appendChild(this._toggleMinimapBtn),this._minimap=document.createElement(`div`),this._minimap.className=`JCV-minimap JCV-border-shadow-bg`;let t=document.createElement(`canvas`);t.className=`JCV-minimap-canvas`,t.width=200,t.height=150,this._minimap.appendChild(t),this._minimapCtx=t.getContext(`2d`),this._viewportRectangle=document.createElement(`div`),this._viewportRectangle.className=`JCV-viewport-rectangle`,this._minimap.appendChild(this._viewportRectangle),this._minimapContainer.appendChild(this._minimap),this.DM.data.container.appendChild(this._minimapContainer),this._minimapContainer.classList.toggle(`JCV-collapsed`,this.collapsed),this._toggleMinimapBtn.addEventListener(`click`,this.toggleCollapse),re(t,t.width,t.height),this.augment({toggleMinimapCollapse:this.toggleCollapse}),this.onStart(this.start),this.onRestart(this.start),this.onDispose(this.dispose)}toggleCollapse=()=>{this.collapsed=!this.collapsed,this.minimapContainer.classList.toggle(`JCV-collapsed`,this.collapsed),this.collapsed||this.updateViewportRectangle()};start=()=>{let e=this.DM.data.nodeBounds;if(!e)return;let t=this.minimap.clientWidth,n=this.minimap.clientHeight,r=t/e.width,i=n/e.height;this.minimapCache.scale=Math.min(r,i)*.9,this.minimapCache.centerX=t/2,this.minimapCache.centerY=n/2,this.minimapCtx.clearRect(0,0,t,n),this.minimapCtx.save(),this.minimapCtx.translate(this.minimapCache.centerX,this.minimapCache.centerY),this.minimapCtx.scale(this.minimapCache.scale,this.minimapCache.scale),this.minimapCtx.translate(-e.centerX,-e.centerY);let a=this.DM.data.canvasData;for(let e of a.edges)this.drawMinimapEdge(e);for(let e of a.nodes)this.drawMinimapNode(e);this.minimapCtx.restore()};drawMinimapNode=e=>{let t=this.SM.getColor(e.color);this.minimapCtx.fillStyle=t.border,C(this.minimapCtx,e.x,e.y,e.width,e.height,25),this.minimapCtx.fill()};drawMinimapEdge=e=>{let t=this.DM.data.nodeMap,n=t[e.fromNode].ref,r=t[e.toNode].ref;if(!n||!r)return;let{x:i,y:a}=w(n,e.fromSide),{x:o,y:s}=w(r,e.toSide);this.minimapCtx.beginPath(),this.minimapCtx.moveTo(i,a),this.minimapCtx.lineTo(o,s),this.minimapCtx.strokeStyle=this.SM.getColor(e.color).active,this.minimapCtx.lineWidth=10,this.minimapCtx.stroke()};updateViewportRectangle=()=>{if(this.collapsed)return;let e=this.DM.data.nodeBounds,t=this.DM.data.container,n=this.DM.data.scale;if(!e)return;let r=t.clientWidth/n,i=t.clientHeight/n,a=-this.DM.data.offsetX/n+t.clientWidth/(2*n),o=-this.DM.data.offsetY/n+t.clientHeight/(2*n),s=this.minimapCache.centerX+(a-r/2-e.centerX)*this.minimapCache.scale,c=this.minimapCache.centerY+(o-i/2-e.centerY)*this.minimapCache.scale,l=r*this.minimapCache.scale,u=i*this.minimapCache.scale;this.viewportRectangle.style.left=`${s}px`,this.viewportRectangle.style.top=`${c}px`,this.viewportRectangle.style.width=`${l}px`,this.viewportRectangle.style.height=`${u}px`};dispose=()=>{this.toggleMinimapBtn.removeEventListener(`click`,this.toggleCollapse),this.minimapCtx.clearRect(0,0,this.minimap.clientWidth,this.minimap.clientHeight),this.minimapContainer.remove(),this._minimapContainer=void 0,this._toggleMinimapBtn=void 0,this._viewportRectangle=void 0,this._minimap=void 0}},ct=`.JSON-Canvas-Viewer.JCV-numb, .JSON-Canvas-Viewer.JCV-numb * {
  pointer-events: none !important;
}
.JSON-Canvas-Viewer .JCV-prevention-container {
  overflow: visible;
  transition: background 200ms, opacity 200ms, box-shadow 200ms, border 200ms, filter 200ms, backdrop-filter 200ms;
}
.JSON-Canvas-Viewer .JCV-prevention-container.JCV-hidden {
  pointer-events: none;
  opacity: 0;
}
.JSON-Canvas-Viewer .JCV-prevention-container .JCV-prevention-banner {
  border-radius: 12px;
  padding: 12px;
  margin: 12px;
  font-size: calc(14px + 0.3vw);
  line-height: calc(17px + 0.3vw);
  text-align: center;
}
`,lt=class extends b{_preventionContainer;preventMt=!1;DM;preventMistouch={initialX:0,initialY:0,lastX:0,lastY:0,record:!1};get preventionContainer(){if(!this._preventionContainer)throw x;return this._preventionContainer}constructor(...e){super(...e);let t=document.createElement(`div`);t.className=`JCV-prevention-banner JCV-border-shadow-bg`,t.textContent=this.options.mistouchPreventerBannerText??`Click on to unlock.`,this.DM=this.container.get(E),this._preventionContainer=document.createElement(`div`),this._preventionContainer.className=`JCV-prevention-container JCV-hidden JCV-full JCV-flex-center`,S(this._preventionContainer,ct),this._preventionContainer.appendChild(t),this.DM.data.container.appendChild(this._preventionContainer),this.options.preventMistouchAtStart&&this.startPrevention(),window.addEventListener(`pointerdown`,this.onPointerDown),window.addEventListener(`pointermove`,this.onPointerMove),window.addEventListener(`pointerup`,this.onPointerUp),this.augment({endMistouchPrevention:this.endPrevention,startMistouchPrevention:this.startPrevention}),this.onDispose(this.dispose)}onPointerDown=e=>{let t=this.DM.data.container.getBoundingClientRect();e.clientX<t.left||e.clientX>t.right||e.clientY<t.top||e.clientY>t.bottom?this.preventMt||this.startPrevention():this.preventMt&&(this.preventMistouch.initialX=e.clientX,this.preventMistouch.initialY=e.clientY,this.preventMistouch.lastX=e.clientX,this.preventMistouch.lastY=e.clientY,this.preventMistouch.record=!0)};onPointerMove=e=>{this.preventMistouch.record&&(this.preventMistouch.lastX=e.clientX,this.preventMistouch.lastY=e.clientY)};onPointerUp=()=>{this.preventMistouch.record&&(this.preventMistouch.record=!1,Math.abs(this.preventMistouch.lastX-this.preventMistouch.initialX)+Math.abs(this.preventMistouch.lastY-this.preventMistouch.initialY)<5&&this.endPrevention())};startPrevention=()=>{this.preventionContainer.classList.remove(`JCV-hidden`),this.DM.data.container.classList.add(`JCV-numb`),this.preventMt=!0};endPrevention=()=>{this.preventMt=!1,this.preventionContainer.classList.add(`JCV-hidden`),setTimeout(()=>this.DM.data.container.classList.remove(`JCV-numb`),50)};dispose=()=>{window.removeEventListener(`pointerdown`,this.onPointerDown),window.removeEventListener(`pointermove`,this.onPointerMove),window.removeEventListener(`pointerup`,this.onPointerUp),this.preventionContainer.remove(),this._preventionContainer=void 0}},ut=[`innerHTML`],dt=g({__name:`Viewer`,props:{modules:{},canvas:{default:()=>({})},attachments:{},options:{default:()=>({})},isPrerendering:{type:Boolean,default:!1},theme:{}},async setup(e,{expose:t}){let r,a,c=te(`viewerRef`),u,h=m(),g=e.isPrerendering?([r,a]=s(()=>$e({attachments:e.attachments,canvas:e.canvas,...e.options})),r=await r,a(),r):``,ee=d();t({viewer:u});function y(e){return({container:t,content:r,node:i,onBeforeUnmount:a,onActive:s,onLoseActive:c})=>{let l=o({render:()=>e(n({content:r,node:i,onActive:s,onLoseActive:c}))});l._context=h.appContext,l.mount(t),a.subscribe(l.unmount)}}return v(()=>e.theme,e=>u?.changeTheme(e)),v(()=>({attachments:e.attachments,canvas:e.canvas}),({canvas:e,attachments:t})=>u?.load({attachments:t,canvas:e})),f(()=>{if(!c.value)return;let t=[`text`,`markdown`,`link`,`audio`,`image`,`video`],n={};for(let e of t){let t=ee[e];t&&(n[e]=y(t))}u=new Qe(Object.assign(e.options,{attachments:e.attachments,canvas:e.canvas,container:c.value,nodeComponents:n,theme:e.theme}),e.modules)}),p(()=>{u?.dispose(),u=void 0}),(e,t)=>(_(),l(`section`,{ref_key:`viewerRef`,ref:c,innerHTML:i(g),style:{"max-height":`100vh`,"max-width":`100vw`}},null,8,ut))}}),ft=g({__name:`Canvas`,props:{canvas:{}},setup(n){let{isDark:a}=ee();return(o,s)=>(_(),r(c,null,{default:t(()=>[e(i(dt),{options:{loading:`lazy`,minimapCollapsed:!0,preventMistouchAtStart:!0},class:`canvas-viewer`,modules:[i(st),i(lt),i(at)],theme:i(a)?`dark`:`light`,canvas:n.canvas,isPrerendering:i(!1)},null,8,[`modules`,`theme`,`canvas`,`isPrerendering`])]),_:1}))}}),pt=JSON.parse(`{"title":"Client-Side Encryption v2","description":"","frontmatter":{},"headers":[],"relativePath":"deep-dive/modules/encryption.md","filePath":"en/deep-dive/modules/encryption.md","lastUpdated":1787979384000}`),mt=g({name:`deep-dive/modules/encryption.md`,setup(t){return(t,n)=>(_(),l(`div`,null,[n[0]||=h(`h1`,{id:`client-side-encryption-v2`,tabindex:`-1`},[a(`Client-Side Encryption v2 `),h(`a`,{class:`header-anchor`,href:`#client-side-encryption-v2`,"aria-label":`Permalink to “Client-Side Encryption v2”`},`​`)],-1),n[1]||=h(`p`,null,[a(`The plugin uploads encrypted files to remote, download and decrypt back to local. This document specifies the encryption algorithm implementation in the `),h(`code`,null,`Encryption`),a(` module.`)],-1),n[2]||=h(`p`,null,`Encryption implementation in this module welcomes volunteer auditing.`,-1),e(ft,{canvas:i(y)},null,8,[`canvas`]),n[3]||=u("",53)]))}});export{pt as __pageData,mt as default};