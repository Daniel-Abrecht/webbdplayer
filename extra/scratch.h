#include <stddef.h>
#include <stdint.h>

extern unsigned char* scratch_start;
extern size_t scratch_size;

static void scratch_mark_used(size_t size){
  // size = (size+7) & ~7;
  scratch_start += size;
  scratch_size -= size;
}

static void scratch_free(size_t size){
  // size = (size+7) & ~7;
  scratch_start -= size;
  scratch_size += size;
}
