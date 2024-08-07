"use strict";
import * as Asyncify from "../asyncify/asyncify.mjs";
import { AsyncCreation } from "./utils.mjs";

export function cstr2str(buf, offset, len){
  const u8 = new Uint8Array(buf, offset ?? 0);
  return new TextDecoder().decode(u8.subarray(0, len ?? u8.indexOf(0)));
}

export const wasi_errno_message = {
  "SUCCESS": "No error occurred. System call completed successfully.",
  "E2BIG": "Argument list too long.",
  "EACCES": "Permission denied.",
  "EADDRINUSE": "Address in use.",
  "EADDRNOTAVAIL": "Address not available.",
  "EAFNOSUPPORT": "Address family not supported.",
  "EAGAIN": "Resource unavailable, or operation would block.",
  "EALREADY": "Connection already in progress.",
  "EBADF": "Bad file descriptor.",
  "EBADMSG": "Bad message.",
  "EBUSY": "Device or resource busy.",
  "ECANCELED": "Operation canceled.",
  "ECHILD": "No child processes.",
  "ECONNABORTED": "Connection aborted.",
  "ECONNREFUSED": "Connection refused.",
  "ECONNRESET": "Connection reset.",
  "EDEADLK": "Resource deadlock would occur.",
  "EDESTADDRREQ": "Destination address required.",
  "EDOM": "Mathematics argument out of domain of function.",
  "EDQUOT": "Reserved.",
  "EEXIST": "File exists.",
  "EFAULT": "Bad address.",
  "EFBIG": "File too large.",
  "EHOSTUNREACH": "Host is unreachable.",
  "EIDRM": "Identifier removed.",
  "EILSEQ": "Illegal byte sequence.",
  "EINPROGRESS": "Operation in progress.",
  "EINTR": "Interrupted function.",
  "EINVAL": "Invalid argument.",
  "EIO": "I/O error.",
  "EISCONN": "Socket is connected.",
  "EISDIR": "Is a directory.",
  "ELOOP": "Too many levels of symbolic links.",
  "EMFILE": "File descriptor value too large.",
  "EMLINK": "Too many links.",
  "EMSGSIZE": "Message too large.",
  "EMULTIHOP": "Reserved.",
  "ENAMETOOLONG": "Filename too long.",
  "ENETDOWN": "Network is down.",
  "ENETRESET": "Connection aborted by network.",
  "ENETUNREACH": "Network unreachable.",
  "ENFILE": "Too many files open in system.",
  "ENOBUFS": "No buffer space available.",
  "ENODEV": "No such device.",
  "ENOENT": "No such file or directory.",
  "ENOEXEC": "Executable file format error.",
  "ENOLCK": "No locks available.",
  "ENOLINK": "Reserved.",
  "ENOMEM": "Not enough space.",
  "ENOMSG": "No message of the desired type.",
  "ENOPROTOOPT": "Protocol not available.",
  "ENOSPC": "No space left on device.",
  "ENOSYS": "Function not supported.",
  "ENOTCONN": "The socket is not connected.",
  "ENOTDIR": "Not a directory or a symbolic link to a directory.",
  "ENOTEMPTY": "Directory not empty.",
  "ENOTRECOVERABLE": "State not recoverable.",
  "ENOTSOCK": "Not a socket.",
  "ENOTSUP": "Not supported, or operation not supported on socket.",
  "ENOTTY": "Inappropriate I/O control operation.",
  "ENXIO": "No such device or address.",
  "EOVERFLOW": "Value too large to be stored in data type.",
  "EOWNERDEAD": "Previous owner died.",
  "EPERM": "Operation not permitted.",
  "EPIPE": "Broken pipe.",
  "EPROTO": "Protocol error.",
  "EPROTONOSUPPORT": "Protocol not supported.",
  "EPROTOTYPE": "Protocol wrong type for socket.",
  "ERANGE": "Result too large.",
  "EROFS": "Read-only file system.",
  "ESPIPE": "Invalid seek.",
  "ESRCH": "No such process.",
  "ESTALE": "Reserved.",
  "ETIMEDOUT": "Connection timed out.",
  "ETXTBSY": "Text file busy.",
  "EXDEV": "Cross-device link.",
  "ENOTCAPABLE": "Extension: Capabilities insufficient.",
};
export const wasi_errno = [];
for(const [k,v] of Object.entries(Object.keys(wasi_errno_message))){
  wasi_errno[k] = v;
  wasi_errno[v] = +k;
}
Object.seal(wasi_errno);
Object.freeze(wasi_errno);

export const wasi_rights = [
  "FD_DATASYNC", "FD_READ", "FD_SEEK", "FD_FDSTAT_SET_FLAGS", "FD_SYNC", "FD_TELL", "FD_WRITE", "FD_ADVISE", "FD_ALLOCATE",
  "PATH_CREATE_DIRECTORY", "PATH_CREATE_FILE", "PATH_LINK_SOURCE", "PATH_LINK_TARGET", "PATH_OPEN", "FD_READDIR",
  "PATH_READLINK", "PATH_RENAME_SOURCE", "PATH_RENAME_TARGET", "PATH_FILESTAT_GET", "PATH_FILESTAT_SET_SIZE",
  "PATH_FILESTAT_SET_TIMES", "FD_FILESTAT_GET", "FD_FILESTAT_SET_SIZE", "FD_FILESTAT_SET_TIMES", "PATH_SYMLINK",
  "PATH_REMOVE_DIRECTORY", "PATH_UNLINK_FILE", "POLL_FD_READWRITE", "SOCK_SHUTDOWN", "SOCK_ACCEPT",
];
for(const [k,v] of Object.entries(wasi_rights))
  wasi_rights[v] = +k;
Object.seal(wasi_rights);
Object.freeze(wasi_rights);
export function wasi_rights_decompose(x){
  const res = [];
  for(let i=0; i<wasi_rights.length; i++)
    if(x & (1n<<BigInt(i)))
      res.push(wasi_rights[i]);
  return res;
}
export function wasi_rights_compose(x){
  let res = 0n;
  for(const k of x){
    if(!wasi_rights[k])
      throw new Error(`Invalid wasi_right "${k}"`);
    res |= 1n<<BigInt(wasi_rights[k]);
  }
  return res;
}

export const DIR_RO_DEFAULT_RIGHTS = wasi_rights_compose([
  'FD_FDSTAT_SET_FLAGS', 'FD_SYNC', 'PATH_OPEN', 'FD_READDIR', 'PATH_FILESTAT_GET', 'FD_FILESTAT_GET', 'POLL_FD_READWRITE', 'PATH_OPEN',
]);

export const FILE_RO_DEFAULT_RIGHTS = wasi_rights_compose([
  'FD_READ', 'FD_SEEK', 'FD_FDSTAT_SET_FLAGS', 'FD_SYNC', 'FD_TELL', 'FD_ADVISE', 'PATH_FILESTAT_GET', 'FD_FILESTAT_GET', 'POLL_FD_READWRITE',
]);

export const PIPE_RO_DEFAULT_RIGHTS = wasi_rights_compose([
  'FD_READ', 'FD_FDSTAT_SET_FLAGS', 'PATH_FILESTAT_GET', 'FD_FILESTAT_GET', 'POLL_FD_READWRITE',
]);

export const PIPE_WR_DEFAULT_RIGHTS = wasi_rights_compose([
  'FD_WRITE', 'FD_FDSTAT_SET_FLAGS', 'PATH_FILESTAT_GET', 'FD_FILESTAT_GET', 'POLL_FD_READWRITE',
]);

export const wasi_filetype = {};
for(const [k,v] of Object.entries([
  "UNKNOWN", "BLOCK_DEVICE", "CHARACTER_DEVICE", "DIRECTORY", "REGULAR_FILE", "SOCKET_DGRAM", "SOCKET_STREAM", "SYMBOLIC_LINK"
])){
  wasi_filetype[k] = v;
  wasi_filetype[v] = +k;
}

export function exception_to_errno_a(f, d='EINVAL'){
  try {
    const res = f();
    if(res instanceof Promise){
      return res.catch(e=>{
        console.groupCollapsed(e.message);
        console.error(e);
        console.groupEnd();
        return wasi_errno[e.code] ?? wasi_errno[d];
      });
    }
    return res;
  } catch(e) {
    console.groupCollapsed(e.message);
    console.error(e);
    console.groupEnd();
    return wasi_errno[e.code] ?? wasi_errno[d];
  }
}

export class WASI_Error extends Error {
  constructor(code, message){
    super(message);
    this.code = code ?? 'EINVAL';
  }
}

let seq=0;

export class WASI_Base extends AsyncCreation {
  #lock = null;
  #fdinfo = [
    { type: wasi_filetype.REGULAR_FILE, rights: PIPE_RO_DEFAULT_RIGHTS }, // stdin
    { type: wasi_filetype.REGULAR_FILE, rights: PIPE_WR_DEFAULT_RIGHTS, fs:{ write: buf=>console.log(cstr2str(buf,0,buf.length))   }}, // stdout
    { type: wasi_filetype.REGULAR_FILE, rights: PIPE_WR_DEFAULT_RIGHTS, fs:{ write: buf=>console.error(cstr2str(buf,0,buf.length)) }}, // stderr
    { type: wasi_filetype.DIRECTORY, rights: DIR_RO_DEFAULT_RIGHTS }, // '/'
  ];
  async init({fs}){
    this.fs = fs;
    this.fs_root = await fs.open("/");
    this.#fdinfo[3].fs = this.fs_root;
    const imports = {};
    for(const o of WebAssembly.Module.imports(this.constructor.wasm_module)){
      const m = imports[o.module] ??= {};
      const x = this['$'+o.name];
      if(o.kind == 'function'){
        if(x){
          //For debugging call order. If an aync was forgotten anywhere, it'll wreck havoc.
          /*m[o.name] = async(...a)=>{
            const s = seq++;
            console.debug(seq, o.module, o.name, ...a);
            const ret = await x.call(this, ...a);
            console.debug(seq);
            return ret;
          };*/
          // For debugging calls
          /*
          m[o.name] = (...a)=>{
            console.debug(o.module, o.name, ...a);
            return x.call(this, ...a);
          };*/
          m[o.name] = (...a)=>x.call(this,...a);
        }else{
          m[o.name] = (...a)=>{
            console.warn("stub", o.module, o.name, ...a);
            return -1;
          };
        }
      }
    }
    this.wasm_instance = await Asyncify.instantiate(this.constructor.wasm_module, imports);
    this.$ = {};
    for(const [k,v] of Object.entries(this.wasm_instance.exports)){
      if(v instanceof Function){
        this.$[k] = async(...x)=>{
          while(this.#lock)
            await this.#lock;
          // Since we always use the same area for the async stack, we can't call any (async) wasm functions at the same time.
          const result = v(...x);
          if(result.then){
            // Make sure #lock is unset before the promise resolves.
            this.#lock = (async()=>{
              try {
                await result;
              } finally {
                this.#lock = null;
              }
            })();
          }
          return result;
        };
      }else{
        this.$[k] = v;
      }
    }
  }
  $environ_sizes_get($a, $b){ return 0; }
  $fd_prestat_get(fd, $bufPtr){
    const stat = this.#fdinfo[fd];
    if(!stat)
      return wasi_errno.EBADF;
    const dv = new DataView(this.$.memory.buffer);
    dv.setUint8($bufPtr, 0 /* variant prestat_dir */);
    dv.setUint32($bufPtr+4, stat.fs?.fs?.path.length /* path length */, true);
    return 0;
  }
  $fd_prestat_dir_name(fd, $path, length){
    const stat = this.#fdinfo[fd];
    if(!stat) return wasi_errno.EBADF;
    const dv = new DataView(this.$.memory.buffer);
    const a = new TextEncoder().encode(stat.fs?.fs?.path ?? '/');
    new Uint8Array(this.$.memory.buffer).set(a, $path);
    return 0;
  }
  $fd_fdstat_get(fd, $buf){
    const dv = new DataView(this.$.memory.buffer);
    const stat = this.#fdinfo[fd] ?? {};
    dv.setUint8($buf, stat.type ?? 0);
    dv.setUint16($buf + 2, 0, true); // FDFLAG u16
    dv.setUint16($buf + 4, 0, true); // FDFLAG u16
    // -1 = Just allow everything. We can still fail calls later.
    dv.setBigUint64($buf + 8, BigInt(stat.rights ?? -1), true);
    dv.setBigUint64($buf + 16, BigInt(stat.inheritable_rights ?? -1), true);
  }
  async $path_open(dirfd, dirflags, $path, path_length, oflags, rights, inheritable_rights, fsFlags, $fd){
    const result = await exception_to_errno_a(async()=>{
      const dir = this.#fdinfo[dirfd];
      if(!dir)
        throw new WASI_Error('EBADF');
      const path = cstr2str(this.$.memory.buffer, $path, path_length);
      // console.log(path, wasi_rights_decompose(rights))
      let fd = 0; // Always allocate the first unused fd.
      let mode = ''; // TODO
      for(fd=0; this.#fdinfo[fd]; fd++);
      // console.log(fd, path);
      const fs = await(await dir.fs.lookup(path)).open(mode);
      const dv = new DataView(this.$.memory.buffer);
      dv.setUint32($fd, fd, true);
      let type = wasi_filetype.DIRECTORY; // TODO
      this.#fdinfo[fd] = {
        type,
        rights,
        fs,
      };
      return 0;
    });
    return result;
  }
  // This is an awful WASI API...
  async $fd_readdir(fd, $buf, size, cookie, $size){
    return await exception_to_errno_a(async()=>{
      const dir = this.#fdinfo[fd];
      const entries = (await dir.fs.readdir(cookie)).slice(Number(cookie));
      const dv = new DataView(this.$.memory.buffer);
      let offset = 0;
      for(let i=0; i<entries.length; i++){
        const entry = entries[i];
        const name = new TextEncoder().encode(entry.name+'\0');
        const len = 24 + name.byteLength + ((8-(name.byteLength%8))%8);
        if(len > size)
          continue; // name too long
        if(offset + len > size)
          break;
        let inode = 0;
        let filetype = 0;
        dv.setBigUint64($buf, BigInt(i + 1), true);
        dv.setBigUint64($buf+8, BigInt(inode), true);
        dv.setUint32($buf+16, name.byteLength, true);
        dv.setUint8($buf+20, filetype);
        new Uint8Array(this.$.memory.buffer).set(name, $buf+24);
        $buf += len;
      }
      dv.setUint32($size, offset, true);
      return 0;
    });
  }
  $fd_close(fd){
    delete this.#fdinfo[fd];
    while(this.#fdinfo.length && !this.#fdinfo[this.#fdinfo.length-1])
      this.#fdinfo.length -= 1;
  }
  async $fd_write(fd, $iovs, count, $nwritten){
    let written = 0;
    const errno = await exception_to_errno_a(async()=>{
      for(const buf of this.getiovs($iovs, count)){
        await this.fd_write_sub(fd, buf);
        written += buf.byteLength;
      }
    });
    const dv = new DataView(this.$.memory.buffer);
    dv.setUint32($nwritten, written, true);
    return errno;
  }
  async fd_write_sub(fd, buf){
    const stat = this.#fdinfo[fd];
    if(!stat.fs?.write)
      throw new WASI_Error('EINVAL', "File is not writable");
    return await stat.fs?.write(buf);
  }
  $fd_read(fd, $iovs, count, $nread){
    return exception_to_errno_a(()=>{
      const stat = this.#fdinfo[fd];
      if(!stat.fs?.read)
        throw new WASI_Error('EINVAL', "File is not readable");
      const iovs = this.getiovs($iovs, count);
      const size = iovs.reduce((a,b)=>a+BigInt(b.byteLength), 0n);
      const result = stat.fs.read(size);
      const f = result=>{
        const dv = new DataView(this.$.memory.buffer);
        let read = 0;
        while(iovs.length && result.length){
          const dst = iovs[0];
          const src = result[0];
          if(src.byteLength <= dst.byteLength){
            dst.set(src);
            iovs[0] = dst.subarray(src.byteLength);
            result.shift();
            if(src.byteLength == dst.byteLength)
              iovs.shift();
            read += src.byteLength;
          }else{
            dst.set(src.subarray(0,dst.byteLength));
            result[0] = src.subarray(dst.byteLength);
            iovs.shift();
            read += dst.byteLength;
          }
        }
        dv.setUint32($nread, read, true);
        return 0;
      };
      return result instanceof Promise ? result.then(f) : f(result);
    });
  }
  $fd_seek(fd, offset, whence, $new_offset){
    return exception_to_errno_a(()=>{
      const stat = this.#fdinfo[fd];
      const dv = new DataView(this.$.memory.buffer);
      const new_offset = stat.fs.seek(offset, ['SET','CUR','END'][whence]);
      const f = new_offset=>{
        dv.setBigUint64($new_offset, new_offset, true);
      };
      return new_offset instanceof Promise ? new_offset.then(f) : f(new_offset);
    });
  }
  $fd_tell(fd, $offset){
    return exception_to_errno_a(()=>{
      const stat = this.#fdinfo[fd];
      const dv = new DataView(this.$.memory.buffer);
      const offset = stat.fs.tell();
      const f = offset=>{
        dv.setBigUint64($offset, offset, true);
      };
      return offset instanceof Promise ? offset.then(f) : f(offset);
    });
  }
  async alloc_str(str){
    const a = new TextEncoder().encode(str+"\0");
    const mem = await this.$.malloc(a.byteLength);
    if(!mem) throw new Error("malloc failed");
    new Uint8Array(this.$.memory.buffer).set(a, mem);
    return mem;
  }
  $clock_time_get(clock_id, precision, $result){
    // Note: No idea how precision is supposed to be used...
    const dv = new DataView(this.$.memory.buffer);
    switch(clock_id){
      case 0: dv.setBigUint64($result, BigInt(Date.now())*1000000n, true); break;
      default: dv.setBigUint64($result, BigInt(performance.now())*1000000n, true); break;
    }
    return 0;
  }
  getiovs($iovs, length){
    const dv = new DataView(this.$.memory.buffer);
    return Array.from({length}, (_, i)=>{
      const ptr = $iovs + (i * 8);
      const $buffer = dv.getUint32(ptr, true);
      const length = dv.getUint32(ptr + 4, true);
      return new Uint8Array(this.$.memory.buffer, $buffer, length);
    }).filter(x=>x.byteLength);
  }
};
