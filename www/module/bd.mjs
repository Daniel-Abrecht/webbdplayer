"use strict";
import { WASI_Base } from "./wasi-helper.mjs";

async function load_libbluray(){
  const module = await WebAssembly.compileStreaming(fetch("build/libbluray.async.wasm"));
  return class Bluray extends WASI_Base {
    static wasm_module = module;
    #bd;
    async init(opts, [device_path, keyfile_path]=[]){
      await super.init(opts);
      if(!device_path){
        this.#bd = await this.$.bd_init();
      }else{
        const $device_path = await this.alloc_str(device_path);
        const $keyfile_path = await this.alloc_str(keyfile_path);
        this.#bd = await this.$.bd_open($device_path, $keyfile_path);
        await this.$.free($device_path);
        await this.$.free($keyfile_path);
      }
      if(!this.#bd)
        throw new Error("Initialization failed");
    }
    async $dl_dlopen($libname, b){
      // const libname = cstr2str(this.$.memory.buffer, $libname);
      // console.debug('dl_dlopen',libname);
      return 0;
    }
    async play(){
      if(!await this.$.bd_play(this.#bd))
        throw new Error('Failed to start bluray playback');
    }
  };
}

export const Bluray = await load_libbluray();
