#ifndef RLE_H
#define RLE_H

typedef uint8_t ARGB[4];

ARGB* decode_pg_rle(unsigned w, unsigned h, const BD_PG_RLE_ELEM* rle, const BD_PG_PALETTE_ENTRY palette[256]);

#endif
