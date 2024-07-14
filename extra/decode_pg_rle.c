#include <libbluray/bluray.h>
#include <libbluray/overlay.h>
#include <string.h>
#include <stdio.h>
#include "rle.h"
#include "scratch.h"

static const float YCbCr_conversion_matrix[3][3] = {
  {1.164, 0.000, 1.596},
  {1.164,-0.392,-0.813},
  {1.164, 2.017, 0.000},
};

ARGB* decode_pg_rle(unsigned w, unsigned h, const BD_PG_RLE_ELEM* rle, const BD_PG_PALETTE_ENTRY palette[256]){
  const size_t size = (size_t)w*h;
  if(sizeof(ARGB[size]) > SCRATCH_BUF_SIZE)
    return 0;
  ARGB* buf = (ARGB*)scratch_buf;
  enum { R,G,B,A };
  for(size_t i=0; i<size;){
    const BD_PG_RLE_ELEM e = *(rle++);
    // if(!e.len) break;
    uint8_t index = e.color;
    ARGB argb = {0};
    if(index != 0xFF){
      const BD_PG_PALETTE_ENTRY p = palette[index];
      const float Y  = p.Y  -  16.;
      const float Cb = p.Cb - 128.;
      const float Cr = p.Cr - 128.;
      argb[A] = p.T;
      argb[R] = YCbCr_conversion_matrix[0][0] * Y + YCbCr_conversion_matrix[0][1] * Cb + YCbCr_conversion_matrix[0][2] * Cr;
      argb[G] = YCbCr_conversion_matrix[1][0] * Y + YCbCr_conversion_matrix[1][1] * Cb + YCbCr_conversion_matrix[1][2] * Cr;
      argb[B] = YCbCr_conversion_matrix[2][0] * Y + YCbCr_conversion_matrix[2][1] * Cb + YCbCr_conversion_matrix[2][2] * Cr;
    }
    for(size_t l=e.len>size-i?size-i:e.len; l--;)
      memcpy(buf[i++], &argb, sizeof(argb));
  }
  return buf;
}
