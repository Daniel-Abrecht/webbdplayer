import { Future } from "./utils.mjs";

export class MediaSourceHelper {
  #x(){} // babel workaround
  #mediaSource;
  #sourceBuffer;
  #header;
  #mime = 'video/mp4; codecs="avc1.42E01E"';
  #onerror;
  #onupdateend;
  #mseURL;
  #waitdone = null;
  #chunk_list = [];
  #resetinprogress = false;
  #waitdata = false;
  #alldone = Future();
  constructor(){
    this.#onerror = this.#_onerror.bind(this);
    this.#onupdateend = this.#_onupdateend.bind(this);
    if(typeof MediaSource === 'undefined')
      throw new Error("MediaSource API unavailable");
    this.#process();
  }
  async #process(){
    while(true){
      this.#waitdone = Future();
      await this.#waitdone;
      this.#waitdata = false;
      if(!this.#sourceBuffer)
        continue;
      const data = this.#chunk_list.shift();
      if(data){
        // console.log('Got data', data.byteLength);
        this.#sourceBuffer.appendBuffer(data);
      }else{
        this.#waitdata = true;
        this.#alldone.resolve();
        this.#alldone = Future();
      }
    }
  }
  #_onerror(error){
    console.error(error.error ?? error);
    this.reset();
  }
  #_onupdateend(){
    if(this.#waitdone)
      this.#waitdone.resolve();
    if(this.video)
      this.video.play();
  }
  reset(){
    if(this.#resetinprogress)
      return;
    if(this.#mediaSource)
      try { this.#mediaSource.endOfStream(); } catch(e) {}
    if(this.#sourceBuffer) this.#sourceBuffer.onupdateend = null;
    this.#mediaSource = null;
    this.#sourceBuffer = null;
    if(this.#mseURL){
      URL.revokeObjectURL(this.#mseURL);
      this.#mseURL = null;
    }
    if(!this.#header || !this.#mime)
      return;
    console.debug("resetting video");
    this.#mediaSource = new MediaSource();
    this.#resetinprogress = true;
    this.#mediaSource.onsourceopen = ()=>{
      this.#resetinprogress = false;
      this.#mediaSource.onsourceopen = null;
      this.#sourceBuffer = this.#mediaSource.addSourceBuffer(this.#mime);
      this.#sourceBuffer.mode = "sequence";
      this.#sourceBuffer.onupdateend = this.#onupdateend;
      this.#chunk_list.unshift(this.#header);
      this.#waitdone.resolve();
    };
    this.#mediaSource.onsourceclose = ()=>{this.reset();};
    const video = this.video;
    if(video){
      try {
        if('srcObject' in video)
          video.srcObject = this.#mediaSource.handle || this.#mediaSource;
      } catch(e) {}
      if(!video.srcObject){
        this.#mseURL = URL.createObjectURL(this.#mediaSource);
        video.src = this.#mseURL;
      }
    }
  }
  setVideo(video){
    if(this.video){
      this.video.removeEventListener("error", this.#onerror);
      this.video.srcObject = null;
      this.video.src = null;
    }
    this.video = video;
    this.video.addEventListener("error", this.#onerror);
    this.reset();
  }
  updateMP4Header(header, mime){
    const oldmime = this.#mime;
    this.#header = header;
    this.#mime = mime;
    if(oldmime != mime || (!this.#sourceBuffer && !this.#resetinprogress)){
      this.reset();
    }else{
      return this.appendData(header, false);
    }
  }
  async appendData(data, detect_header=true){
    // console.log(data, detect_header);
    if(detect_header){
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let o = 0;
      while(true){
        const type = dv.getUint32(o+4);
        const size = dv.getUint32(o+0);
        if(type == 0x6d6f6f66) // moof
          break;
        o += size;
        if(size == 0 || o+8 >= dv.byteLength)
          break;
      }
      if(o){
        this.updateMP4Header(data.slice(0,o), this.#mime);
        data = data.subarray(o);
      }
    }
    if(!data.byteLength)
      return;
    if(!this.#mime)
      throw new Error("Error: updateMP4Header must be called first");
    this.#chunk_list.push(data);
    if(this.#waitdata)
      this.#waitdone.resolve();
    return this.#alldone;
  }
};
