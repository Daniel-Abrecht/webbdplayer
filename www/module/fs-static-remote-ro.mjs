"use strict";
import { AsyncCreation } from "./utils.mjs";
import * as PageCache from "./page-cache.mjs";
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

const page_size = 1024n * 40n;
const read_ahead = 10n;

export class API {
  constructor(url, base){
    base = FileSystem.normalize_path(base??[]);
    base = base.map(x=>encodeURIComponent(x)).join('/');
    url = new URL(url, document.baseURI);
    url.pathname = (url.pathname+'/'+base).replace(/\/\/+/,'/');
    this.url = url;
    this.loading = [];
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
  async load(path, page_start, page_count){
    path = FileSystem.normalize_path(path)
                     .filter(x=>x)
                     .map(x=>encodeURIComponent(x))
                     .join('/');
    let url = new URL(this.url);
    url.pathname = (url.pathname+'/'+path+'/data').replace(/\/\/+/,'/');
    url = url.href;
    let results = [];
    {
      let j=0;
      for(let i=Number(page_start),e=i+Number(page_count); i<e; i++,j++){
        if(this.loading[i]){
          results[j] = this.loading[i];
        }else{
          results[j] = PageCache.load(url, i);
        }
      }
    }
    results = await Promise.all(results);
    let start = 0;
    let end = 0;
    const pranges = [];
    for(let i=0; i<results.length; i++){
      if(results[i]){
        if(end)
          pranges.push([page_start+BigInt(start),page_start+BigInt(end)]);
        start = i+1;
        end = 0;
      }else{
        end = i+1;
      }
    }
    if(end) pranges.push([page_start+BigInt(start),page_start+BigInt(end)]);
    if(pranges.length){
      const ranges = pranges.map(([a,b])=>[a*page_size,b*page_size]);
      const purl = url+'?r='+ranges.map(a=>a.join('-')).join(',');
      console.log(pranges, ranges);
      const promise = fetch(purl).then(async r=>{
        if(!r.ok)
          throw new Error(r.statusText ?? r.status);
        return r.arrayBuffer();
      });
      {
        let j=0;
        for(const prange of pranges)
        for(let i=prange[0]; i<prange[1]; i++){
          const k = Number(i);
          const l = j++;
          results[k-Number(page_start)] = this.loading[k] = (async()=>{
            let v;
            try {
              v = await promise;
            } catch(e) {
              delete this.loading[k];
              throw e;
            }
            const start = l*Number(page_size);
            const end = Math.min(start + Number(page_size), v.byteLength);
            const res = new Uint8Array(v, start, end-start);
            await PageCache.store(url, k, res);
            delete this.loading[k];
            return res;
          })();
        }
      }
      results = await Promise.all(results);
    }
    return results;
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
      case 'CUR': p = this.offset + offset; break;
      case 'END': p = size + offset; break;
      case 'SET': p = offset; break;
    }
    if(p < 0n)
      throw new FileSystemError('EINVAL',"Negative offset not allowed");
    // console.log(this.offset, p, offset, whence, size);
    this.offset = p;
    return p;
  }
  tell(){
    return this.offset;
  }
  async pread(size, offset){
    const file_size = BigInt(this.file.info.size);
    if(offset >= file_size)
      return [];
    if(offset+size >= file_size)
      size = file_size-offset;
    if(this.file.info.content)
      return [this.file.info.content.subarray(Number(offset), Number(size))];
    return await this.file.load_data(offset, size);
  }
  async read(size){
    const result = await this.pread(size, this.offset);
    this.offset += size;
    return result;
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

function max(a,b){
  return a > b ? a : b;
}

function min(a,b){
  return a < b ? a : b;
}

export class File extends EntryMixin(AbstractFile){
  async init(...x){
    await super.init(...x);
    if(this.info.type !== 'file')
      throw new Error("Not a file!");
  }
  async load_data(offset, size){
    const page_start = offset / page_size;
    const page_count = (min(offset + size + read_ahead * page_size, BigInt(this.info.size)) + page_size - 1n) / page_size - page_start;
    const result = await this.api.load(this.path, page_start, page_count);
    if(result[0]){
      if(result[0].byteLength <= Number(offset-page_start*page_size)){
        result.shift();
      }else{
        result[0] = result[0].subarray(Number(offset-page_start*page_size));
      }
    }
    //console.log(offset, size, new Blob(result));
    return result;
  }
};
