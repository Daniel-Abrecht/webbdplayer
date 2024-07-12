#include <libbluray/bluray.h>
#include <libbluray/overlay.h>

static void cb_overlay(void *ptr, const BD_OVERLAY*const overlay);
static void cb_overlay_argb(void *ptr, const BD_ARGB_OVERLAY*const overlay);

int setup(BLURAY* bluray){
  bd_register_overlay_proc(bluray, 0, cb_overlay);
  bd_register_argb_overlay_proc(bluray, 0, cb_overlay_argb, 0);
  return 0;
}
