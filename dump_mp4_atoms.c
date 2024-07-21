#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <inttypes.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

#define htonl(X) ( \
      (((uint32_t)(X)<<24)&0xFF000000llu) \
    | (((uint32_t)(X)<< 8)&0x00FF0000llu) \
    | (((uint32_t)(X)>> 8)&0x0000FF00llu) \
    | (((uint32_t)(X)>>24)&0x000000FFllu) \
  )
#define htonll(X) ( \
      (((uint64_t)(X)<<56)&0xFF00000000000000llu) \
    | (((uint64_t)(X)<<40)&0x00FF000000000000llu) \
    | (((uint64_t)(X)<<24)&0x0000FF0000000000llu) \
    | (((uint64_t)(X)<< 8)&0x000000FF00000000llu) \
    | (((uint64_t)(X)>> 8)&0x00000000FF000000llu) \
    | (((uint64_t)(X)>>24)&0x0000000000FF0000llu) \
    | (((uint64_t)(X)>>40)&0x000000000000FF00llu) \
    | (((uint64_t)(X)>>56)&0x00000000000000FFllu) \
  )

struct box {
  uint32_t size;
  char name[4];
};

void fail(const char* message){
  puts(message);
  exit(1);
}

bool dump_all = false;
char dump_atom_name[4];

void parse(int level, size_t max_size){
  struct box box;
  size_t size = 0;
  while(max_size-size >= 8){
    size_t off = 8;
    if(fread(&box, 8, 1, stdin) < 1)
      break;
    uint64_t bsize = htonl(box.size);
    if(bsize == 1 && max_size-size >= 16u){
      if(fread(&bsize, 8, 1, stdin) < 1)
        fail("Failed to read extended mp4 box size");
      bsize = htonll(bsize);
      off += 8;
    }
    if(!bsize) bsize = max_size;
    printf("%*s%4.4s %"PRIu64"\n", level*2, "", box.name, bsize);
    if(bsize < 8 || bsize > max_size-size)
      fail("mp4 box has invalid size");
    long long l = 0;
    if( memcmp(box.name, "moov", 4)
     && memcmp(box.name, "trak", 4)
     && memcmp(box.name, "mdia", 4)
     && memcmp(box.name, "minf", 4)
     && memcmp(box.name, "edts", 4)
     && memcmp(box.name, "dinf", 4)
     && memcmp(box.name, "stbl", 4)
     && memcmp(box.name, "udta", 4)
     && memcmp(box.name, "mvex", 4)
     && memcmp(box.name, "moof", 4)
     && memcmp(box.name, "traf", 4)
    ) l = bsize-off;
    if(l >= 78 && !memcmp(box.name, "avc1", 4))
      l = 78;
    if( l >= 8 && !( memcmp(box.name, "dref", 4)
                  && memcmp(box.name, "stsd", 4)
    )) l = 8;
    if(l >= 4 && !memcmp(box.name, "meta", 4))
      l = 4;
    if(l){
      if(dump_all || !memcmp(dump_atom_name, box.name, 4)){
        for(long long s=l; s>0; s-=16){
          int n = s>=16 ? 16 : s;
          unsigned char data[16];
          fread(data, n, 1, stdin);
          printf("%*s", level*2+2, "");
          for(int i=0; i<n; i++)
            printf("%02X %*s", data[i], (i%8)==7, "");
	  printf("%*s", (16-n)*3+2-n/8, "");
          for(int i=0; i<n; i++)
            printf("%c", isprint(data[i]) ? data[i] : '.');
          printf("\n");
        }
      }else{
        fseek(stdin, l, SEEK_CUR);
      }
      off += l;
    }
    if(bsize-off)
      parse(level+1, bsize-off);
    size += bsize;
  }
  if(max_size != (size_t)-1 && size != max_size)
    fail("Read less data then expected");
}

int main(int argc, char* argv[]){
  if(argc >= 3)
    goto usage;
  if(argc >= 2){
    dump_all = !strcmp("-a", argv[1]);
    if(!dump_all){
      if(strlen(argv[1]) != 4)
        goto usage;
      memcpy(dump_atom_name, argv[1], 4);
    }
  }
  parse(0, -1);
  return 0;
usage:
  fprintf(stderr, "usage: ./dump_mp4_atoms [-a|atom]\n");
  return 1;
}
