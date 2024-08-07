"use strict";
import { GLBDPlayer } from "./bdplayer.js";
import * as SRROFS from "./fs-static-remote-ro.mjs";

class UIPlayer extends HTMLElement {
  #last_video_frame_callback = 0;
  #last_run;
  #running;
  #player;
  #canvas;
  #root;
  #gl;
  static get observedAttributes() {
    return ["src"];
  }
  constructor(){
    super();
    this.#canvas = document.createElement("canvas");
    this.#gl = this.#canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      premultipliedAlpha: false,
    });
    this.#canvas.tabIndex = -1;
    this.#root = this.attachShadow({ mode: "closed" });
    this.#root.appendChild(this.#canvas);
    this.#canvas.width = 1920;
    this.#canvas.height = 1080;
    this.style.display = 'inline-flex';
    this.addEventListener("click", ()=>this.play());
  }
  connectedCallback(){
    this.#player?.connectedCallback?.();
  }
  disconnectedCallback(){
    this.#player?.disconnectedCallback?.();
  }
  async open(uri){
    let [_, type, location] = uri.match(/^(bluray:|video:)?([^]*)$/m)
    type ??= 'video:';
    switch(type){
      case 'bluray:': {
        const bluray_rootfs = await SRROFS.Directory.create(location);
        this.#player = await GLBDPlayer.create(bluray_rootfs, {
          gl: this.#gl,
          onframe: (now)=>this.#drawVideoFrame(now),
        });
        if(this.parentNode)
          this.#player?.connectedCallback?.();
      }; break;
      case 'video:': {
        throw new Error("Not yet implemented");
      }; break;
    }
    this.#main_loop();
  }
  async play(){
    await this.#player.play();
  }
  #main_loop(){
    if(this.#running)
      return;
    this.#running = true;
    this.#main_loop_sub();
  }
  #main_loop_sub(now){
    if(!this.#running)
      return;
    this.#running = false;
    if(now - this.#last_video_frame_callback > 1000 / 12){
      // Less than 12fps? Way too slow or not running!
      this.#drawFrame(now);
    }
    this.#running = true;
    requestAnimationFrame((now)=>this.#main_loop_sub(now));
  }
  #drawVideoFrame(now){
    this.#last_video_frame_callback = now;
    this.#drawFrame(now);
  }
  #drawFrame(now){
    if(now - this.#last_run < 1000 / 100)
      return;
    this.#last_run = now;
    this.#player?.drawFrame?.(now);
  }
  close(){
    this.#running = false;
    if(this.parentNode)
      this.#player?.disconnectedCallback?.();
    this.#player = null;
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if(oldValue == newValue) return;
    if(name === 'src'){
      if(newValue){
        this.open(newValue);
      }else{
        this.close();
      }
    }
  }
};
customElements.define("ui-player", UIPlayer);
