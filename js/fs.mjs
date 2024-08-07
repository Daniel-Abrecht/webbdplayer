"use strict";
import { AsyncCreation } from "./utils.mjs";

function strcmp(a, b){ return (a<b?-1:(a>b?1:0)); }

export class FileSystemError extends Error { constructor(code, message){ super(message); this.code = code ?? 'EINVAL'; } }
export class NotADirectoryError extends FileSystemError { constructor(message){ super('ENOTDIR',message??'Not a directory'); } }
export class FileNotFoundError extends FileSystemError { constructor(message){ super('ENOENT',message??'File not found'); } }

export class Dirent extends AsyncCreation {};
export class AbstractDirectory extends Dirent {};
export class AbstractFile extends Dirent {};
//export class AbstractSymlink {};

// TODO: make more things conditionally async

class FileDescription {
  constructor(fse){
    this.fs = fse;
    this.fd = null;
    this.opened = false;
  }
  lookup(...x){
    return this.fs.lookup(...x);
  }
  async open(mode){
    if(this.fs.dirent?.open)
      this.fd = await this.fs.dirent.open(this, mode);
    this.opened = true;
  }
  // Note: The following methods may or may not return promises.
  // Sometimes, waiting for promises would be too slow. The asyncify stuff may have to unwind the stack when things aren't sync.
  readdir(index){
    if(this.fs.dirent?.readdir)
      return this.fs.dirent.readdir(Number(index));
    // TODO: check mountpoint paths
    return [];
  }
  seek(offset, whence){
    if(!this.fd?.seek)
      throw new FileSystemError('ESPIPE',"Illegal seek");
    return this.fd.seek(offset, whence);
  }
  tell(){
    if(!this.fd?.tell)
      throw new FileSystemError('ESPIPE',"FIle not seekable");
    return this.fd.tell();
  }
  pread(size, offset){
    if(!this.fd?.read)
      throw new FileSystemError('EINVAL',"File is not readable");
    return this.fd.read(size, offset);
  }
  read(size){
    if(!this.fd?.read)
      throw new FileSystemError('EINVAL',"File is not readable");
    return this.fd.read(size);
  }
};

class FileSystemEntry {
  constructor(fs, path, dirent){
    this.fs = fs;
    this.path = FileSystem.normalize_path(path).join('/');
    if(dirent instanceof AbstractDirectory || !dirent){
      if(this.path.at(-1) !== '/')
        this.path += '/';
    }else{
      if(this.path.at(-1) === '/')
        throw new NotADirectoryError(`File ${this.path} has no name`);
    }
    this.dirent = dirent;
  }
  lookup(path){
    path = FileSystem.normalize_path(path, {allow_relative: true});
    if(!path.length)
      return this;
    if(this.path.at(-1) !== '/')
      throw new NotADirectoryError(`Not a directory: ${this.path}/${path.join('/')}`);
    if(path.length === 1 && path[0] === '')
      return this;
    return this.fs.lookup([this.path,path]);
  }
  lookup_direct(path){
    path = FileSystem.normalize_path(path);
    if(!path.length)
      return this;
    if(this.path.at(-1) !== '/')
      throw new NotADirectoryError(`Not a directory: ${this.path}/${path.join('/')}`);
    if(path.length === 1 && path[0] === '')
      return this;
    let entry = this;
    while(path.length){
      entry = entry.get_direct(path.shift());
      if(entry instanceof Promise){
        entry = (async(entry)=>{
          while(path.length)
            entry = (await entry).get_direct(path.shift());
          return entry;
        })(entry);
        break;
      }
    }
    return entry;
  }
  get_direct(name){
    // console.log('get_direct', this.path,name);
    if(!this.dirent?.lookup)
      throw new FileNotFoundError(`File not found: ${this.path}/${name}`);
    const dirent = this.dirent.lookup(name);
    const f = (dirent)=>{
      if(!dirent)
        throw new FileNotFoundError(`File not found: ${this.path}${name}`);
      return new FileSystemEntry(this.fs, [this.path,name], dirent);
    }
    return dirent instanceof Promise ? dirent.then(f) : f(dirent);
  }
  async open(mode){
    const fd = new FileDescription(this);
    await fd.open(mode);
    return fd;
  }
}

export class FileSystem {
  #x(){} // babel workaround
  #mountpoints = [];
  get_mount(path){
    path = FileSystem.normalize_path([path,'/']).join('/').replace(/\/$/,'');
    for(const [k,v] of Object.entries(this.#mountpoints))
      if(v.path === path)
        return [+k,v];
  }
  mount(path, dirent){
    const fs = new FileSystemEntry(this, [path,'/'], dirent);
    const mount = this.get_mount(fs.path);
    if(mount){
      mount[1].fs.unshift(fs);
    }else{
      this.#mountpoints.push({path: fs.path.replace(/\/$/,''), fs: [fs]});
      this.#mountpoints.sort((a,b)=>strcmp(b.path,a.path)).reverse();
    }
  }
  umount(path){
    const mount = this.get_mount(path);
    if(!mount)
      throw new FileSystemError('EINVAL',"Mountpoint not found");
    mount[1].fs.shift();
    if(!mount[1].fs.length)
      this.#mountpoints.splice(mount[0], 1);
  }
  lookup(path){
    path = FileSystem.normalize_path(path);
    let normalized = path.join('/');
    if(normalized.at(-1) !== '/')
      normalized += '/';
    for(const mp of this.#mountpoints){
      if(!normalized.startsWith(mp.path+'/'))
        continue;
      path.splice(0,mp.path.split('/').length);
      return mp.fs[0].lookup_direct(path);
    }
    let path_exists = normalized === '/';
    if(!path_exists)
    for(const mp of this.#mountpoints){
      if(!(mp.path+'/').startsWith(normalized))
        continue;
      path_exists = true;
      break;
    }
    if(!path_exists)
      throw new FileNotFoundError("File not found: "+path.join('/'));
    return new FileSystemEntry(this, [path,''], null); // Temporary entry
  }
  async open(path, mode){ // mode: "r"=read "w"=write "rw"="readwrite" "a"=append
    return await (await this.lookup(path)).open(mode);
  }
  static normalize_path(path, {allow_relative}={}){
    path = [path].flat(Infinity);
    if(path.some(x=>typeof x !== 'string'))
      throw new FileSystemError('EINVAL',"Path must consist only of strings!");
    path = path.map(x=>x.split('/')).flat();
    if(path.some(x=>x.indexOf('\0') !== -1))
      throw new FileSystemError('EINVAL',"Null bytes are not allowed in paths!");
    const isdir = path.at(-1) === '' || path.at(-1) === '.' || path.at(-1) === '..';
    path = path.filter(x=>x!==''&&x!=='.');
    const res = [];
    for(const p of path){
      if(p === '..'){
        if(!res.length){
          if(!allow_relative)
            throw new FileSystemError('EINVAL',"Path is relative to location outside of it's root!");
        }else{
          res.pop();
          continue;
        }
      }
      res.push(p);
    }
    if(isdir) res.push('');
    return res;
  }
};
