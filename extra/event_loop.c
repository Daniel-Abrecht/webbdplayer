#include <libbluray/bluray.h>
#include <stdio.h>
#include "scratch.h"

#define BD_CLUSTER_SIZE 6144
#define BD_READ_SIZE    (10 * BD_CLUSTER_SIZE)

int cb_new_data(BD_EVENT* e, int n, int s);
int remux_buffer(int size, unsigned char* input);

int event_loop(BLURAY* bluray){
  int n = 0;
  BD_EVENT e[32]; // See libbluray/src/util/event_queue.c MAX_EVENTS
  static unsigned char buffer[BD_READ_SIZE];
  int nread = bd_read_ext(bluray, buffer, BD_READ_SIZE, &e[n]);
  while(e[n].event != BD_EVENT_NONE)
    bd_get_event(bluray, &e[++n]);
  if(e[n].event != BD_EVENT_NONE)
    n += 1;
  int s = remux_buffer(nread, buffer);
  if(n || s>0)
    if(cb_new_data(e, n, s))
      goto error;
  if(nread < 0){
    fprintf(stderr, "bd_read failed\n");
    goto error;
  }
  return 0;
error:
  return -1;
}
