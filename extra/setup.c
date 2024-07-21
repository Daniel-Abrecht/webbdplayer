#include <libbluray/bluray.h>
#include <libbluray/overlay.h>
#include "scratch.h"
#include "rle.h"

void cb_overlay(void *ptr, const BD_OVERLAY*const overlay, ARGB* decoded);
void cb_overlay_argb(void *ptr, const BD_ARGB_OVERLAY*const overlay);

// We'll use this to decode overlays into and stuff. This is probably bigger than necessary.
_Alignas(8) uint8_t scratch_buf[SCRATCH_BUF_SIZE];

static void cb_overlay_wrapper(void *ptr, const BD_OVERLAY*const overlay){
  ARGB* result = 0;
  if(overlay->img)
    result = decode_pg_rle(overlay->w, overlay->h, overlay->img, overlay->palette);
  cb_overlay(ptr, overlay, result);
}

int setup(BLURAY* bluray){
  bd_register_overlay_proc(bluray, 0, cb_overlay_wrapper);
  bd_register_argb_overlay_proc(bluray, 0, cb_overlay_argb, 0);
  return 0;
}
