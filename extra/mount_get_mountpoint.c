#include "util/strutl.h"

char *mount_get_mountpoint(const char *device_path){
  return str_dup(device_path);
}
