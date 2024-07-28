#include <libbluray/bluray.h>
#include <stdio.h>
#include "remuxer.h"

#define BD_CLUSTER_SIZE 6144
#define BD_READ_SIZE    (10 * BD_CLUSTER_SIZE)

int cb_new_data(BD_EVENT* event, int event_count, void* mp4_chunk, unsigned mp4_chunk_length);

int event_loop(BLURAY* bluray){
  int n = 0;
  BD_EVENT e[32]; // See libbluray/src/util/event_queue.c MAX_EVENTS
  static unsigned char buffer[BD_READ_SIZE];
  int nread = bd_read_ext(bluray, buffer, BD_READ_SIZE, &e[n]);
  while(e[n].event != BD_EVENT_NONE)
    bd_get_event(bluray, &e[++n]);
  if(e[n].event != BD_EVENT_NONE)
    n += 1;
  struct bo mp4_chunk = remux_buffer(nread, buffer);
  if(n || mp4_chunk.length)
    if(cb_new_data(e, n, mp4_chunk.data, mp4_chunk.length))
      goto error;
  if(nread < 0){
    fprintf(stderr, "bd_read failed\n");
    goto error;
  }
  return 0;
error:
  return -1;
}
