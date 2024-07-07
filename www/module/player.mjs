"use strict";
import { Bluray } from "./bd.mjs";
import { FileSystem } from "./fs.mjs";
import * as SRROFS from "./fs-static-remote-ro.mjs";

const fs = new FileSystem();
const bluray_rootfs = await SRROFS.Directory.create('fs.php/','bd/Kaijin Kaihatsu-bu no Kuroitsu-san BD2');
fs.mount('/bd/', bluray_rootfs);

const bluray = await Bluray.create({fs},["/bd/"]);
console.log(bluray);
