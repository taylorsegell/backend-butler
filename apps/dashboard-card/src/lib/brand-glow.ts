/** Approved Butler geometry. Motion uses session state and measured transport levels. */
import type { VoiceFeedbackPhase } from "./voice-feedback";
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision highp float;
varying vec2 uv;
uniform float time;
uniform float energy;
uniform float active;
uniform float quiet;
uniform sampler2D brand;
uniform sampler2D brandGlow;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float n=0.;float a=.55;for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.03+vec3(3.1,1.7,7.2);a*=.48;}return n;}
void main(){
 vec2 p=(uv-.5)*2.;
 float breathe=1.+energy*.025;
 vec2 logoUV=.5+(uv-.5)/breathe;
 vec4 sharp=texture2D(brand,logoUV);
 vec4 soft=texture2D(brandGlow,logoUV);
 vec2 mark=sharp.rg*sharp.a;
 vec2 aura=soft.rg*soft.a;
 float radius=length(p);
 float t=time*.22;
 vec3 v=vec3(p*1.1,t*.13);
 float cloud=fbm(v+vec3(0.,-t*.2,2.));
 float flow=sin(p.y*3.8+p.x*2.+cloud*7.-t*.8)*.5+.5;
 float silk=.98+.02*smoothstep(.15,.85,flow);
 vec3 jacket=vec3(.97,.97,.959)*silk;
 vec3 tie=vec3(.988,.42,.008)*(.99+.015*flow);
 vec3 whiteGlow=vec3(.84,.89,.85);
 vec3 amber=vec3(1.,.27,.012);
 // A quiet rounded field retains the orb's presence; the actual logo owns the light.
 float field=exp(-radius*radius*2.8)*.038;
 field*=smoothstep(1.05,.7,radius);
 float strength=.86+active*.16+energy*.34;
 float totalAura=aura.r+aura.g;
 vec3 haloColor=(whiteGlow*aura.r+amber*aura.g)/max(totalAura,.0001);
 vec3 color=mix(amber,haloColor,smoothstep(0.,.015,totalAura));
 float alpha=max(field,max(aura.r,aura.g)*strength);
 color=mix(color,jacket,mark.r);
 color=mix(color,tie,mark.g);
 alpha=max(alpha,max(mark.r,mark.g)*.98);
 // Quiet states settle rather than recoloring the white jacket or orange bow tie.
 color*=1.-quiet*.008;
 // WKWebView's compositor needs premultiplied color, including transparent corners.
 alpha=clamp(alpha,0.,1.);
 gl_FragColor=vec4(color*alpha,alpha);
}`;

function makeBrandTextures(gl: WebGLRenderingContext, program: WebGLProgram, svg: SVGSVGElement) {
 if(!svg)throw Error('Butler brand geometry is unavailable');
 const size=512,core=document.createElement('canvas'),glow=document.createElement('canvas');
 core.width=core.height=glow.width=glow.height=size;
 const paint=core.getContext('2d'),blur=glow.getContext('2d');
 const [x,y,width,height]=svg.getAttribute('viewBox').split(/\s+/).map(Number);
 const scale=size*.80/Math.max(width,height);
 paint.translate((size-width*scale)/2,(size-height*scale)/2);
 paint.scale(scale,scale);paint.translate(-x,-y);
 for(const path of svg.querySelectorAll('path')){
  // R = approved white jacket/buttons; G = approved orange bow tie.
  paint.fillStyle=path.getAttribute('fill').toLowerCase()==='#fc6b02'?'#00ff00':'#ff0000';
  paint.fill(new Path2D(path.getAttribute('d')));
 }
 blur.filter='blur(18px)';blur.drawImage(core,0,0);
 blur.globalAlpha=.38;blur.filter='blur(40px)';blur.drawImage(core,0,0);
 const textures: WebGLTexture[]=[];
 for(const [unit,name,image]of [[0,'brand',core],[1,'brandGlow',glow]] as const){
  const texture=gl.createTexture();textures.push(texture);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program,name),unit);
 }
 return textures;
}

export function createBrandGlow(canvas: HTMLCanvasElement, svg: SVGSVGElement, state: () => VoiceFeedbackPhase, getLevel: () => number) {
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,powerPreference:'low-power'});
 canvas.parentElement.dataset.renderer='fallback';
 // If the device cannot honor transparent premultiplied compositing, keep the SVG.
 if(!gl || !gl.getContextAttributes()?.alpha || !gl.getContextAttributes()?.premultipliedAlpha)return {refresh(){},dispose(){}};
 const shaders: WebGLShader[]=[];
 const compile=(type: number,source: string)=>{const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader};
 let program: WebGLProgram,textures: WebGLTexture[]=[];
 try{program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Orb unavailable');gl.useProgram(program);textures=makeBrandTextures(gl,program,svg);canvas.dataset.brand='butler-logo';}
 catch{shaders.forEach(shader=>gl.deleteShader(shader));textures.forEach(texture=>gl.deleteTexture(texture));if(program)gl.deleteProgram(program);return {refresh(){},dispose(){}};}
 canvas.parentElement.dataset.renderer='webgl';
 gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const uTime=gl.getUniformLocation(program,'time'),uEnergy=gl.getUniformLocation(program,'energy'),uActive=gl.getUniformLocation(program,'active'),uQuiet=gl.getUniformLocation(program,'quiet');
 let frame=0,last=0,clock=3.4,disposed=false,visible=true;
 const render=(now: number)=>{
  frame=0;if(disposed||document.hidden||!visible||canvas.parentElement.getBoundingClientRect().width===0)return;
  const moving=!media.matches&&['listening','thinking','speaking','connecting','reconnecting'].includes(state());
  const delta=last?Math.min((now-last)/1000,.1):0;last=now;
  if(moving)clock+=delta*(state()==='speaking'?1.3:.6);
  const size=Math.min(512,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5)));
  if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;gl.viewport(0,0,size,size);}
  const raw=getLevel();
  const level=media.matches?0:Number.isFinite(raw)?Math.min(1,Math.max(0,raw)):0;
  gl.uniform1f(uTime,clock);gl.uniform1f(uEnergy,level);gl.uniform1f(uActive,state()==='idle'?0:1);gl.uniform1f(uQuiet,['paused','error','idle'].includes(state())?1:0);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
  if(moving)frame=requestAnimationFrame(next=>{if(next-last<30){frame=requestAnimationFrame(render);}else render(next)});
 };
 const refresh=()=>{cancelAnimationFrame(frame);last=0;if(!disposed)frame=requestAnimationFrame(render)};
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;refresh()});observer.observe(canvas);
 const resized=new ResizeObserver(refresh);resized.observe(canvas);
 const lost=(e: Event)=>{e.preventDefault();canvas.parentElement.dataset.renderer='fallback';cancelAnimationFrame(frame)};
 canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',refresh);media.addEventListener('change',refresh);refresh();
 return {refresh,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();resized.disconnect();document.removeEventListener('visibilitychange',refresh);media.removeEventListener('change',refresh);canvas.removeEventListener('webglcontextlost',lost);gl.deleteProgram(program);shaders.forEach(shader=>gl.deleteShader(shader));gl.deleteBuffer(buffer);textures.forEach(texture=>gl.deleteTexture(texture));}};
}
