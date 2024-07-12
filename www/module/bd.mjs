"use strict";
import { WASI_Base } from "./wasi-helper.mjs";

const bd_event_e = [
  'BD_EVENT_NONE','BD_EVENT_ERROR','BD_EVENT_READ_ERROR','BD_EVENT_ENCRYPTED',
  'BD_EVENT_ANGLE','BD_EVENT_TITLE','BD_EVENT_PLAYLIST','BD_EVENT_PLAYITEM',
  'BD_EVENT_CHAPTER','BD_EVENT_PLAYMARK','BD_EVENT_END_OF_TITLE','BD_EVENT_AUDIO_STREAM',
  'BD_EVENT_IG_STREAM','BD_EVENT_PG_TEXTST_STREAM','BD_EVENT_PIP_PG_TEXTST_STREAM',
  'BD_EVENT_SECONDARY_AUDIO_STREAM','BD_EVENT_SECONDARY_VIDEO_STREAM',
  'BD_EVENT_PG_TEXTST','BD_EVENT_PIP_PG_TEXTST','BD_EVENT_SECONDARY_AUDIO',
  'BD_EVENT_SECONDARY_VIDEO','BD_EVENT_SECONDARY_VIDEO_SIZE','BD_EVENT_PLAYLIST_STOP',
  'BD_EVENT_DISCONTINUITY','BD_EVENT_SEEK','BD_EVENT_STILL','BD_EVENT_STILL_TIME',
  'BD_EVENT_SOUND_EFFECT','BD_EVENT_IDLE','BD_EVENT_POPUP','BD_EVENT_MENU',
  'BD_EVENT_STEREOSCOPIC_STATUS','BD_EVENT_KEY_INTEREST_TABLE','BD_EVENT_UO_MASK_CHANGED',
];
for(let i=0; i<bd_event_e.length; i++)
  bd_event_e[bd_event_e[i]] = i;

async function load_libbluray(){
  const module = await WebAssembly.compileStreaming(fetch("build/libbluray.async.wasm"));
  return class Bluray extends WASI_Base {
    static wasm_module = module;
    #bd;
    #event_loop_running = false;
    #still_timer_resume;
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
      this.$.setup(this.#bd);
    }
    async $dl_dlopen($libname, b){
      // const libname = cstr2str(this.$.memory.buffer, $libname);
      // console.debug('dl_dlopen',libname);
      return 0;
    }
    async play(){
      if(!await this.$.bd_play(this.#bd))
        throw new Error('Failed to start bluray playback');
      this.event_loop();
    }
    event_loop(){
      if(this.#event_loop_running)
        return;
      this.#event_loop_running = true;
      (async()=>{
        try {
          while(this.#event_loop_running){
            const res = await this.$.event_loop(this.#bd);
            if(res == -1)
              throw new Error("Failed to get events");
            if(this.still_time){
              await { then: resolve=>{
                let still_timer;
                const resume = ()=>{
                  clearTimeout(still_timer);
                  still_timer = null;
                  this.#still_timer_resume = null;
                  resolve();
                };
                this.#still_timer_resume = resume;
                still_timer = setTimeout(resume, this.still_time*1000)
              }};
            }else{
              await { then: resolve => requestAnimationFrame(resolve) };
            }
          }
        } finally {
          this.#event_loop_running = false;
        }
      })();
    }
    still_timer_resume(){
      this.#still_timer_resume?.();
    }
    async $cb_event($event){
      const dv = new DataView(this.$.memory.buffer, $event);
      const ev = {
        type: dv.getUint32(0,true),
        param: dv.getUint32(4,true),
      };
      if(ev.type == bd_event_e.BD_EVENT_STILL_TIME)
        this.still_time = ev.param || 60; // ev is infinite, bit it's easier to just delay and retry for a bit longer.
      //   return; // Nothing to do
      console.log(bd_event_e[ev.type], ev);
      if(ev.type == bd_event_e.BD_EVENT_READ_ERROR)
        return -1; // For debbuging
      return 0;
    }
    async $cb_overlay($ptr, $overlay){
      const dv = new DataView(this.$.memory.buffer, $overlay);
      const overlay = {
        pts: dv.getBigInt64(0, true),
        plane: dv.getUint8(8),
        cmd: dv.getUint8(9),
        palette_update_flag: dv.getUint8(10),
        x: dv.getUint16(12,true),
        y: dv.getUint16(14,true),
        w: dv.getUint16(16,true),
        h: dv.getUint16(18,true),
        $palette: dv.getUint32(20,true),
        $img: dv.getUint32(24,true),
      };
      console.log('overlay', overlay);
    }
  };
}

export const Bluray = await load_libbluray();
