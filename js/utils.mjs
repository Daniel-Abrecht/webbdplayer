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
