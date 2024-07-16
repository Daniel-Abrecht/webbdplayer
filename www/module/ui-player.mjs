"use strict";
import { GLBDPlayer } from "./bdplayer.js";
import * as SRROFS from "./fs-static-remote-ro.mjs";

class UIPlayer extends HTMLElement {
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
        this.#player = await GLBDPlayer.create(bluray_rootfs, {gl:this.#gl});
        if(this.parentNode)
          this.#player?.connectedCallback?.();
      }; break;
      case 'video:': {
        throw new Error("Not yet implemented");
      }; break;
    }
    this.main_loop();
  }
  async play(){
    await this.#player.play();
  }
  async main_loop(){
    const NF = { then: c=>requestAnimationFrame(c) };
    try {
      if(this.#running)
        return;
      this.#running = true;
      while(this.#running)
        this.drawFrame(await NF);
    } finally {
      this.#running = false;
    }
  }
  drawFrame(){
    this.#player?.drawFrame?.();
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
