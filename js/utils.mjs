"use strict";

export class AsyncCreation {
  #x(){} // babel workaround
  static #lock;
  constructor(){
    if(!AsyncCreation.#lock)
      throw new Error("Use the create() function instead of new!");
  }
  static async create(...x){
    let self;
    AsyncCreation.#lock = true;
    try {
      self = new this(...x);
    } finally {
      AsyncCreation.#lock = false;
    }
    if(self.init)
      await self.init(...x);
    return self;
  }
};

export function Future(){
  let resolve, reject;
  const p = new Promise((a,b)=>{
    resolve = a;
    reject = b;
  });
  p.resolve = resolve;
  p.reject = reject;
  return p;
};

export const $setUint64 = Symbol("setUint64");
DataView.prototype[$setUint64] = function($offset, value, endianess){
  if(!(value instanceof Array))
    value = [value<0?4294967295-value/4294967296:value/4294967296,value];
  if(endianess){
    this.setUint32($offset+0, value[1]|0, true);
    this.setUint32($offset+4, value[0]|0, true);
  }else{
    this.setUint32($offset+0, value[0]|0, false);
    this.setUint32($offset+4, value[1]|0, false);
  }
};
