"use strict";
import { AsyncCreation } from "./utils.mjs";
import {
  AbstractDirectory,
  AbstractFile,
  FileSystem,
  FileSystemError,
  NotADirectoryError
} from "./fs.mjs";

function unmarshall_meta(o){
  o = {...o};
  if(o.type === 'file' && 'content' in o){
    const content = new Uint8Array(Array.from(atob(o.content), x=>x.charCodeAt(0)));
    if(content.byteLength !== o.size)
      throw new Error("File size in metadata and content size differ!!!");
    o.content = content;
  }
  if(o.type === 'directory')
    for(const k in o.content)
      o.content[k] = unmarshall_meta(o.content[k]);
  return o;
}

export class API {
  constructor(url, base){
    base = FileSystem.normalize_path(base??[]);
    base = base.map(x=>encodeURIComponent(x)).join('/');
    url = new URL(url, document.baseURI);
    url.pathname = (url.pathname+'/'+base).replace(/\/\/+/,'/');
    this.url = url;
  }
  async lookup(path){
    path = FileSystem.normalize_path(path)
                     .filter(x=>x)
                     .map(x=>encodeURIComponent(x))
                     .join('/');
    let url = new URL(this.url);
    url.pathname = (url.pathname+'/'+path+'/meta').replace(/\/\/+/,'/');
    url = url.href;
    const response = await fetch(url);
    if(!response.ok)
      throw new Error(response.statusText ?? response.status);
    return unmarshall_meta(await response.json());
  }
}

class FileDescription {
  constructor(file, fd){
    this.file = file;
    this.fd = fd;
    this.offset = 0n;
  }
  async open(mode){
    if((mode??'').indexOf('a') !== -1)
      this.offset = this.file.info.size ?? 0;
  }
  seek(offset, whence){
    if(!('size' in this.file.info))
      throw new FileSystemError('ESPIPE',"Illegal seek");
    const size = BigInt(this.file.info.size);
    let p;
    switch(whence){
      case 'CUR': p = this.offset - offset; break; // TODO: Probably wrong
      case 'END': p = size + offset; break;
      case 'SET': p = offset; break;
    }
    if(p < 0n) throw new FileSystemError('EINVAL',"Negative offset not allowed");
     console.log(this.offset, p, offset, whence, size);
    this.offset = p;
    return p;
  }
  async read(size, offset){
    offset ??= this.offset;
    const file_size = BigInt(this.file.info.size);
    if(offset >= file_size)
      return [];
    if(this.file.info.content)
      return [this.file.info.content.subarray(Number(offset), Number(size))];
    throw new Error("TODO");
  }
}

const EntryMixin = e => class EntryMixin extends e {
  static #lock;
  async init(api, base, {path, info}={}){
    this.path = path??[];
    this.api = api instanceof API ? api : new API(api, base);
    if(info && info.type !== 'directory'){
      this.info = await info;
    }else{
      // We want to load the directory listing and small files in advance
      this.info = await this.api.lookup(path??[]);
    }
    this.content = Object.create(null);
  }
  async open(fd, mode){
    const x = new FileDescription(this, fd);
    await x.open(mode);
    return x;
  }
};

export class Directory extends EntryMixin(AbstractDirectory){
  async init(...x){
    await super.init(...x);
    if(this.info.type !== 'directory')
      throw new Error("Not a directory!");
  }
  async lookup(name){
    const path = FileSystem.normalize_path([this.path, name]);
    if(!this.info.content.hasOwnProperty(name))
      throw new NotADirectoryError(`File not found: ${path.join('/')}`);
    const info = await this.info.content[name];
    if(this.content[name])
      return await this.content[name];
    let result = null; // Note: this is going to be a promise
    switch(info.type){
      case 'directory': result = Directory.create(this.api, null, {path,info}); break;
      case 'file': result = File.create(this.api, null, {path,info}); break;
    }
    this.content[name] = result;
    return await result;
  }
  async readdir(index){
    return Object.keys(this.info.content).slice(index);
  }
};

export class File extends EntryMixin(AbstractFile){
  async init(...x){
    await super.init(...x);
    if(this.info.type !== 'file')
      throw new Error("Not a file!");
  }
};
