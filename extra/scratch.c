#include <scratch.h>

// We'll use this to decode overlays into and stuff. This is probably bigger than necessary.
#define SCRATCH_BUF_SIZE 4*1024*1024*2*2

static _Alignas(8) uint8_t scratch_buf[SCRATCH_BUF_SIZE];

unsigned char* scratch_start = scratch_buf;
size_t scratch_size = SCRATCH_BUF_SIZE;
