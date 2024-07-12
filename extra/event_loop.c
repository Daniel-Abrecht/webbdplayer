#include <libbluray/bluray.h>
#include <stdio.h>

#define BD_CLUSTER_SIZE 6144
#define BD_READ_SIZE    (10 * BD_CLUSTER_SIZE)

int cb_event(BD_EVENT* e);

int event_loop(BLURAY* bluray){
  BD_EVENT e;
  static unsigned char buffer[BD_READ_SIZE];
  int nread = bd_read_ext(bluray, buffer, BD_READ_SIZE, &e);
  while(e.event != BD_EVENT_NONE){
    if(cb_event(&e))
      goto error;
    bd_get_event(bluray, &e);
  }
  if(nread < 0){
    fprintf(stderr, "bd_read failed\n");
    goto error;
  }
  return 0;
error:
  return -1;
}
