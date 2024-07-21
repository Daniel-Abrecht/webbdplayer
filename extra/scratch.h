#define SCRATCH_BUF_SIZE 4*1024*1024*2*2

// We'll use this to decode overlays into and stuff. This is probably bigger than necessary.
extern _Alignas(8) uint8_t scratch_buf[SCRATCH_BUF_SIZE];
