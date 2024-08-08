
const cache = await caches.open("page-cache-v1");

export async function cleanup(minsize){
  let all = await cache.keys();
  for(const r of all)
    r.s = new URL(a.url).searchParams;
  all = all.sort((a,b)=>+a.s.t-+b.s.t);
  let s=0;
  for(const r of all){
    cache.delete(r);
    s += +r.s.s;
    if(s >= minsize)
      break;
  }
}

export async function load(key, page){
  const uri = "https://page-cache-v1/"+encodeURIComponent(key)+'/'+page;
  const r = new Request(uri);
  const result = await cache.match(r, {ignoreSearch: true});
  if(result)
    return new Uint8Array(await result.arrayBuffer());
}

export async function store(key, page, data){
  const size = +(data.byteLength ?? data.length);
  const access = Date.now();
  const uri = "https://page-cache-v1/"+encodeURIComponent(key)+'/'+page+'?t='+Date.now() + '&s=' + size;
  const k = new Request(uri);
  const v = new Response(data);
  cache.delete(k, {ignoreSearch: true});
  try {
    await cache.put(k,v);
  } catch(e){
    console.log(e);
    cleanup(Math.max(size * 2, 1024*1024*100));
    await cache.put(k,v);
  }
}
