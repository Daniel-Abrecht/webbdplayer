"use strict";
import { WASI_Base } from "./wasi-helper.mjs";

function mkenum(o){
  for(let i=0; i<o.length; i++)
    if(o[i])
      o[o[i]] = i;
  Object.seal(o);
  Object.freeze(o);
  return o;
}

const bd_event_e = mkenum([
  'NONE','ERROR','READ_ERROR','ENCRYPTED',
  'ANGLE','TITLE','PLAYLIST','PLAYITEM',
  'CHAPTER','PLAYMARK','END_OF_TITLE','AUDIO_STREAM',
  'IG_STREAM','PG_TEXTST_STREAM','PIP_PG_TEXTST_STREAM',
  'SECONDARY_AUDIO_STREAM','SECONDARY_VIDEO_STREAM',
  'PG_TEXTST','PIP_PG_TEXTST','SECONDARY_AUDIO',
  'SECONDARY_VIDEO','SECONDARY_VIDEO_SIZE','PLAYLIST_STOP',
  'DISCONTINUITY','SEEK','STILL','STILL_TIME',
  'SOUND_EFFECT','IDLE','POPUP','MENU',
  'STEREOSCOPIC_STATUS','KEY_INTEREST_TABLE','UO_MASK_CHANGED',
]);
const bd_overlay_plane_e = mkenum(['PG','IG']);
const bd_overlay_cmd_e = mkenum(['INIT', 'CLOSE', 'CLEAR', 'DRAW', 'WIPE', 'HIDE', 'FLUSH']);
const bd_argb_overlay_cmd_e = mkenum(['INIT','CLOSE',,,'DRAW','FLUSH']);

const bd_vk_key_e = {
  NONE: 0xFFFF,
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  ROOT_MENU: 10,
  POPUP: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  ENTER: 16,
  MOUSE_ACTIVATE: 17,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
};
Object.seal(bd_vk_key_e);
Object.freeze(bd_vk_key_e);

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
      await this.$.setup(this.#bd);
      this.overlay_current = [];
      this.overlay_scratch = [];
      console.log(this.$);
    }
    async $dl_dlopen($libname, b){
      // const libname = cstr2str(this.$.memory.buffer, $libname);
      // console.debug('dl_dlopen',libname);
      return 0;
    }
    async play(){
      if(!await this.$.bd_play(this.#bd))
        throw new Error('Failed to start bluray playback');
      this.#event_loop();
      this.still_timer_resume?.();
    }
    async #event_loop(){
      if(this.#event_loop_running)
        return;
      this.#event_loop_running = true;
      this.#event_loop_sub();
    }
    async #event_loop_sub(){
      if(!this.#event_loop_running)
        return;
      try {
        const res = await this.$.event_loop(this.#bd);
        if(res == -1)
          throw new Error("Failed to get events");
        if(this.still_time){
          let still_timer;
          const resume = ()=>{
            clearTimeout(still_timer);
            still_timer = null;
            this.#still_timer_resume = null;
            requestAnimationFrame(()=>this.#event_loop_sub());
          };
          this.#still_timer_resume = resume;
          still_timer = setTimeout(resume, this.still_time*1000)
          this.still_time = 0;
        }else{
          requestAnimationFrame(()=>this.#event_loop_sub());
        }
      } catch(e) {
        this.#event_loop_running = false;
        throw e;
      };
    }
    static vk_key_e = bd_vk_key_e;
    // key is one of Bluray.vk_key_e
    async keypress_begin(key){
      if(typeof key == "string")
        key = key.toUpperCase();
      if(key in bd_vk_key_e)
        key = bd_vk_key_e[key];
      await this.$.bd_user_input(this.#bd, -1n, key|0x80000000);
      this.still_timer_resume?.();
    }
    async keypress_end(key){
      if(typeof key == "string")
        key = key.toUpperCase();
      if(key in bd_vk_key_e)
        key = bd_vk_key_e[key];
      await this.$.bd_user_input(this.#bd, -1n, key|0x20000000);
      this.still_timer_resume?.();
    }
    async keypress(key){
      if(typeof key == "string")
        key = key.toUpperCase();
      if(key in bd_vk_key_e)
        key = bd_vk_key_e[key];
      await this.$.bd_user_input(this.#bd, -1n, key|0x20000000);
      await this.$.bd_user_input(this.#bd, -1n, key|0x40000000);
      await this.$.bd_user_input(this.#bd, -1n, key|0x80000000);
      this.still_timer_resume?.();
    }
    still_timer_resume(){
      this.#still_timer_resume?.();
    }
    async $cb_new_data($events, n, $mp4, mp4_length){
      const events = new Uint32Array(this.$.memory.buffer, $events, n*2);
      for(let i=0; i<n*2; i+=2){
        const type = events[i+0];
        const param = events[i+1];
        if(type == bd_event_e.STILL_TIME)
          this.still_time = param || 60; // 0 is infinite, but it's easier to just delay and retry for a bit longer.
        //   return; // Nothing to do
        console.info('event',bd_event_e[type], param);
        if(type == bd_event_e.READ_ERROR)
          return -1; // For debbuging
      }
      if(mp4_length){
        const mp4_stream = new Uint8Array(this.$.memory.buffer, $mp4, mp4_length);
        (window.dbgbuf??=[]).push(this.$.memory.buffer.slice($mp4, $mp4+mp4_length));
        console.log(mp4_stream);
      }
      return 0;
    }
    async $cb_overlay($ptr, $overlay, $decoded){
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
      const i = overlay.plane * 2;
      const scratch = this.overlay_scratch[i+0] ??= { objects:[] };
      const unref = x=>{
        if(!--x.refcount && this.cb_overlay_free)
          this.cb_overlay_free(x);
      };
      const wipe = rect => {
        rect ??= [
          [overlay.x,overlay.y],
          [overlay.x+overlay.w,overlay.y+overlay.h],
        ];
        const l = scratch.objects;
        for(let i=l.length; i--; ){
          const o = l[i];
          const w = o.rect[1][0] - o.rect[0][0];
          const h = o.rect[1][1] - o.rect[0][1];
          const b = [ // Coordinates normalized to target rect range, 0.0 to 1.0
            [(rect[0][0]-o.rect[0][0])/w, (rect[0][1]-o.rect[0][1])/h],
            [(rect[1][0]-o.rect[0][0])/w, (rect[1][1]-o.rect[0][1])/h],
          ];
          const lv = [];
          for(const a of o.visible){
            if( b[1][0] <= a[0][0] || b[1][1] <= a[0][1]
              || b[0][0] >= a[1][0] || b[0][1] >= a[1][1]
            ){ // Keep area, fully outside removed area, no need to split it
              lv.push(a);
            }else{
              // Some part of the rectangle must be cut out.
              // If the to be cut out rectangle was in the middle, it can be tiled into 8 smaller rectangles by extending the lines of the inner rectangle.
              // This is always some combination of the coordinates of the corners of the rectangles.
              // Since the area to cut out may be only partially inside, we clamp all areas to the outer area and check if it's width / height is >0, else it's outside.
              const c = [
                [ [a[0][0],a[0][1]],[b[0][0],b[0][1]] ], [ [b[0][0],a[0][1]],[b[1][0],b[0][1]] ], [ [b[1][0],a[0][1]],[a[1][0],b[0][1]] ],
                [ [a[0][0],b[0][1]],[b[0][0],b[1][1]] ],                                          [ [b[1][0],b[0][1]],[a[1][0],b[1][1]] ],
                [ [a[0][0],b[1][1]],[b[0][0],a[1][1]] ], [ [b[0][0],b[1][1]],[b[1][0],a[1][1]] ], [ [b[1][0],b[1][1]],[a[1][0],a[1][1]] ],
              ].filter(x=>!(x[0][0]>=a[1][0] || x[0][1]>=a[1][1] || x[1][0]<=a[0][0] || x[1][1]<=a[0][1]))
                .map(r=>r.map(([x,y])=>[
                  Math.min(a[1][0],Math.max(x,a[0][0])),
                  Math.min(a[1][1],Math.max(y,a[0][1])),
                ])).filter(([[x0,y0],[x1,y1]])=>(x0<x1 && y0<y1))
                  .forEach(x=>lv.push(x));
            }
          }
          o.visible = lv;
          if(!o.visible.length){
            l.splice(i, 1);
            unref(o);
          }
        }
      }
      switch(overlay.cmd){
        case bd_overlay_cmd_e.INIT: {
          scratch.rect = [
            [overlay.x,overlay.y],
            [overlay.x+overlay.w,overlay.y+overlay.h],
          ];
          scratch.objects.forEach(unref);
          scratch.objects = [];
        } break;
        case bd_overlay_cmd_e.CLOSE: {
          if(this.overlay_current[i+0])
            this.overlay_current[i+0].objects.forEach(unref);
          scratch.objects.forEach(unref);
          delete this.overlay_scratch[i+0];
          delete this.overlay_current[i+0];
        } break;
        case bd_overlay_cmd_e.WIPE: wipe(); break;
        case bd_overlay_cmd_e.CLEAR: {
          scratch.objects.forEach(unref);
          scratch.objects = [];
        } break;
        case bd_overlay_cmd_e.DRAW: {
          wipe();
          scratch.objects.push({
            refcount: 1,
            rect: [
              [overlay.x,overlay.y],
              [overlay.x+overlay.w,overlay.y+overlay.h],
            ],
            visible: [ [[0,0],[1,1]] ], // Normalized coordinates for visible rectangles
            img: await createImageBitmap(new ImageData( // TODO: Cut away transparent borders to safe some memory.
              // Note: This buffer may get overwritten after leaving this function
              new Uint8ClampedArray(this.$.memory.buffer, $decoded, overlay.w*overlay.h*4),
              overlay.w, overlay.h
            )),
          });
        } break;
        case bd_overlay_cmd_e.HIDE: {
          if(this.overlay_current[i+0])
            this.overlay_current[i+0].objects.forEach(unref);
          delete this.overlay_current[i+0];
        } break;
        case bd_overlay_cmd_e.FLUSH: {
          if(!scratch.rect) break;
          let ov = {
            layer: overlay.plane,
            rect: scratch.rect,
            objects: [...scratch.objects],
          };
          // Note: We use the overlay plane size here, but we'd really need the size of the video instead.
          const sw = ov.rect[1][0] - ov.rect[0][0];
          const sh = ov.rect[1][1] - ov.rect[0][1];
          ov.objects.forEach(x=>x.refcount++);
          for(const obj of ov.objects){
            const ow = obj.rect[1][0] - obj.rect[0][0];
            const oh = obj.rect[1][1] - obj.rect[0][1];
            const a = obj.attribute = {
              texcoord: new Float32Array(obj.visible.length*12),
            };
            // Multiplying the texture coordinates with this matrix will result in the position coordinates
            // Note: range is -1 to 1 instead of 0 to 1.
            obj.view_matrix = [
              ow/sw*2,  0, (obj.rect[0][0] + ov.rect[0][0]) / sw* 2 - 1,
              0, oh/sh*-2, (obj.rect[0][1] + ov.rect[0][1]) / sh*-2 + 1,
              0, 0, 0,
            ];
            let i = 0;
            for(const rect of obj.visible){
              a.texcoord[i+ 0] = rect[0][0];
              a.texcoord[i+ 1] = rect[0][1];
              a.texcoord[i+ 2] = rect[1][0];
              a.texcoord[i+ 3] = rect[0][1];
              a.texcoord[i+ 4] = rect[0][0];
              a.texcoord[i+ 5] = rect[1][1];
              a.texcoord[i+ 6] = rect[1][0];
              a.texcoord[i+ 7] = rect[0][1];
              a.texcoord[i+ 8] = rect[0][0];
              a.texcoord[i+ 9] = rect[1][1];
              a.texcoord[i+10] = rect[1][0];
              a.texcoord[i+11] = rect[1][1];
              //
              i += 12;
            }
          }
          if(this.overlay_current[i+0])
            this.overlay_current[i+0].objects.forEach(unref);
          this.overlay_current[i+0] = ov;
          this.cb_overlay_update?.(ov);
        } break;
      }
    }
  };
}

export const Bluray = await load_libbluray();
