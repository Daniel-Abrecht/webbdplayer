"use strict";
import { Bluray } from "./bd.mjs";
import { FileSystem } from "./fs.mjs";
import { AsyncCreation } from "./utils.mjs";

export class GLBDPlayer extends AsyncCreation {
  #bluray;
  #gl;
  #program = {};
  #shader = {};
  #source = {
    main_vertex: `\
#version 300 es
precision mediump float;

in vec2 a_texcoord;
out vec2 v_texcoord;
uniform mat3 u_view;

void main() {
  v_texcoord = a_texcoord;
  gl_Position = vec4(vec3(a_texcoord,1.)*u_view, 1.0);
}
`,  main_fragment: `\
#version 300 es
precision mediump float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
out vec4 color;

void main() {
  color = texture(u_texture, v_texcoord);
}
`,
  };
  static #key_mapping = {
    13: 'ENTER',
    37: 'LEFT',
    38: 'UP',
    39: 'RIGHT',
    40: 'DOWN',
    27: 'ROOT_MENU', // ESC
    81: 'ROOT_MENU', // Q
    32: 'POPUP', // space
    48: 0,
    49: 1,
    50: 2,
    51: 3,
    52: 4,
    53: 5,
    54: 6,
    55: 7,
    56: 8,
    57: 9,
    82: 'RED', // R
    71: 'GREEN', // G
    66: 'BLUE', // B
    89: 'YELLOW', // Y
    85: 'RED', // U
    73: 'GREEN', // I
    79: 'BLUE', // O
    80: 'YELLOW', // P
  };
  async init(directory, {gl}={}){
    this.#onkeydown = this.#onkeydown.bind(this);
    this.#onkeyup = this.#onkeyup.bind(this);
    this.#gl = gl;
    const fs = new FileSystem();
    fs.mount('/bd/', directory);
    this.#bluray = await Bluray.create({fs},["/bd/"]);
    this.#bluray.cb_overlay_free = (...x)=>this.#overlay_free(...x);
    this.#bluray.cb_overlay_update = (...x)=>this.#overlay_update(...x);
    this.#shader.main_vertex   = this.#compile_shader(gl.VERTEX_SHADER, this.#source.main_vertex);
    this.#shader.main_fragment = this.#compile_shader(gl.FRAGMENT_SHADER, this.#source.main_fragment);
    this.#program.main = this.#compile_program(this.#shader.main_vertex, this.#shader.main_fragment, ['a_texcoord'], ['u_texture','u_view']);
  }
  #onkeyup = function(event){
    this.#bluray.keypress_begin(GLBDPlayer.#key_mapping[event.keyCode]);
  };
  #onkeydown = function(event){
    this.#bluray.keypress_end(GLBDPlayer.#key_mapping[event.keyCode]);
  };
  connectedCallback(){
    //this.#bluray.keypress_start()
    this.#gl.canvas.addEventListener("keydown", this.#onkeydown);
    this.#gl.canvas.addEventListener("keyup", this.#onkeyup);
  }
  disconnectedCallback(){
    this.#gl.canvas.removeEventListener("keydown", this.#onkeydown);
    this.#gl.canvas.removeEventListener("keyup", this.#onkeyup);
  }
  #compile_program(vertex, fragment, attr, uni){
    const gl = this.#gl;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
      const error = gl.getProgramInfoLog(program);
      throw new Error(`Failed to link GPU program: ${error}`);
    }
    program.attr = {};
    for(const a of attr)
      program.attr[a] = gl.getAttribLocation(program, a);
    program.uni = {};
    for(const a of uni)
      program.uni[a] = gl.getUniformLocation(program, a);
    return program;
  }
  #compile_shader(type, source){
    const gl = this.#gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      const error = gl.getShaderInfoLog(shader);
      throw new Error(`Failed to compile vertex shader: ${error}`);
    }
    return shader;
  }
  #overlay_update(overlay){
    const gl = this.#gl;
    for(const o of overlay.objects){
      o.texture ??= this.#textureFromImage(o.img);
      o.buffer ??= {};
      {
        const buffer = o.buffer.texcoord ??= gl.createBuffer();
        if(!o.vao){
          o.vao = gl.createVertexArray();
          gl.bindVertexArray(o.vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.enableVertexAttribArray(this.#program.main.attr.a_texcoord);
          gl.vertexAttribPointer(this.#program.main.attr.a_texcoord, 2, gl.FLOAT, false, 0, 0);
          gl.bindVertexArray(null);
        }else{
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        }
        gl.bufferData(gl.ARRAY_BUFFER, o.attribute.texcoord, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      }
    }
  }
  #overlay_free(o){
    const gl = this.#gl;
    Object.values(o.buffer??{}).forEach(b=>gl.deleteBuffer(b));
    if(o.vao)
      gl.deleteVertexArray(o.vao);
    if(o.texture)
      gl.deleteTexture(o.texture);
  }
  #textureFromImage(img){
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }
  play(){
    return this.#bluray.play();
  }
  drawFrame([w,h]=[0,0],[x,y]=[0,0]){
    const gl = this.#gl;
    w ||= gl.drawingBufferWidth;
    h ||= gl.drawingBufferHeight;
    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(x,y,w,h);
    gl.scissor(x,y,w,h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.#program.main);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.#program.main.uni.u_texture, 0);
    for(const overlay of this.#bluray.overlay_current) if(overlay){
      for(const o of overlay.objects){
        gl.bindVertexArray(o.vao);
        gl.bindTexture(gl.TEXTURE_2D, o.texture);
        gl.uniformMatrix3fv(this.#program.main.uni.u_view, false, o.view_matrix);
        gl.drawArrays(gl.TRIANGLES, 0, o.attribute.texcoord.length/2);
      }
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
  }
}
