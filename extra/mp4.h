#include <stdint.h>
#include <string.h>
#include <stddef.h>
#include <stdbool.h>

// Note, we just assume little endian.

#ifndef htons
#define htons(X) ((uint16_t)( \
      (((uint16_t)(X)<<8)&0xFF00) \
    | (((uint16_t)(X)>>8)&0x00FF) \
  ))
#endif
#ifndef htonl
#define htonl(X) ((uint32_t)( \
      (((uint32_t)(X)<<24)&0xFF000000) \
    | (((uint32_t)(X)<< 8)&0x00FF0000) \
    | (((uint32_t)(X)>> 8)&0x0000FF00) \
    | (((uint32_t)(X)>>24)&0x000000FF) \
  ))
#endif
#ifndef htonll
#define htonll(X) ( \
      (((uint64_t)(X)<<56)&0xFF00000000000000llu) \
    | (((uint64_t)(X)<<40)&0x00FF000000000000llu) \
    | (((uint64_t)(X)<<24)&0x0000FF0000000000llu) \
    | (((uint64_t)(X)<< 8)&0x000000FF00000000llu) \
    | (((uint64_t)(X)>> 8)&0x00000000FF000000llu) \
    | (((uint64_t)(X)>>24)&0x0000000000FF0000llu) \
    | (((uint64_t)(X)>>40)&0x000000000000FF00llu) \
    | (((uint64_t)(X)>>56)&0x00000000000000FFllu) \
  )
#endif

#define MP4_OUTBUF_STACK_SIZE 16

struct mp4_outbuf {
  unsigned char* data;
  size_t size;
  size_t offset;
  size_t stack_index;
  size_t stack[MP4_OUTBUF_STACK_SIZE];
};

typedef union fourcc {
  unsigned char c[4];
  uint32_t u;
} fourcc;
#define fourcc(X) _Generic((X), \
    fourcc: X, \
    char*: (fourcc){.c={_Generic(X, char*: X, default: "    ")[0],_Generic(X, char*: X, default: "    ")[1],_Generic(X, char*: X, default: "    ")[2],_Generic(X, char*: X, default: "    ")[3]}}, \
    default: (fourcc){.u=htonl(_Generic(X, fourcc: 0, char*: 0, default: X))} \
  )
#define list(X) sizeof(X)/sizeof(*X), X
#define dlist(N, X) .N##_count=sizeof(X)/sizeof(*X), .N=X

enum mp4_write_result {
  MP4WR_STACK_UNDERFLOW = -4,
  MP4WR_STACK_OVERFLOW = -3,
  MP4WR_BUFFER_TOO_SMALL = -2,
  MP4WR_INVALID_DATA = -1,
  MP4WR_OK = 0,
};

#define MP4_T1_E(T,N) const T N;
#define MP4_T1_L(T,N) const size_t N ## _count; const T* N;
#define MP4_T2_E(T,N) + sizeof(T)
#define MP4_T2_L(T,N) + a->N ## _count * sizeof(T)
#define MP4_T3_E(T,N) memcpy(&buf->data[buf->offset], &a->N, sizeof(T)); buf->offset += sizeof(T);
#define MP4_T3_L(T,N) memcpy(&buf->data[buf->offset], a->N, a->N ## _count * sizeof(T)); buf->offset += a->N ## _count * sizeof(T);
#define MP4_T(N, C) \
  typedef struct mp4_box_##N##_t { \
    MP4T(MP4_T1_E, MP4_T1_L) \
  } mp4_box_##N##_t; \
  static enum mp4_write_result mp4_box_##N##_##C( \
    struct mp4_outbuf* buf, \
    const mp4_box_##N##_t*restrict const a \
  ){ \
    const size_t size = 8+MP4T(MP4_T2_E, MP4_T2_L); \
    const enum mp4_write_result ret = (C) ? mp4_box_start(buf, fourcc(#N "    ")) \
                                          : mp4_box_write(buf, size, fourcc(#N "    ")); \
    if(ret<0) \
      return ret; \
    if(size > buf->offset-buf->size) \
      return MP4WR_BUFFER_TOO_SMALL; \
    MP4T(MP4_T3_E, MP4_T3_L) \
    return MP4WR_OK; \
  }
#define mp4_t_box_write(N, MP4, ...) mp4_box_##N##_false(MP4, &(const mp4_box_##N##_t){__VA_ARGS__})
#define mp4_t_box_start(N, MP4, ...) mp4_box_##N##_true(MP4, &(const mp4_box_##N##_t){__VA_ARGS__})

static enum mp4_write_result mp4_box_write(
  struct mp4_outbuf* buf,
  const uint32_t size,
  const fourcc type
){
  if(size < 8)
    return MP4WR_INVALID_DATA;
  if(size > buf->offset-buf->size)
    return MP4WR_BUFFER_TOO_SMALL;
  memcpy(&buf->data[buf->offset], &(uint32_t){htonl(size)}, 4);
  memcpy(&buf->data[buf->offset+4], &type, 4);
  buf->offset += 8;
  return MP4WR_OK;
}

static enum mp4_write_result mp4_box_start(
  struct mp4_outbuf* buf,
  const fourcc type
){
  if(8 > buf->size-buf->offset)
    return MP4WR_BUFFER_TOO_SMALL;
  if(buf->stack_index >= MP4_OUTBUF_STACK_SIZE)
    return MP4WR_STACK_OVERFLOW;
  buf->stack[buf->stack_index++] = buf->offset;
  memcpy(&buf->data[buf->offset+4], &type, 4);
  buf->offset += 8;
  return MP4WR_OK;
}

static enum mp4_write_result mp4_box_commit(struct mp4_outbuf* buf){
  if(!buf->stack_index)
    return MP4WR_STACK_UNDERFLOW;
  const size_t offset = buf->stack[--buf->stack_index];
  memcpy(&buf->data[offset], &(uint32_t){htonl(buf->offset-offset)}, 4);
  return MP4WR_OK;
}

static enum mp4_write_result mp4_box_rollback(struct mp4_outbuf* buf){
  if(!buf->stack_index)
    return MP4WR_STACK_UNDERFLOW;
  const size_t offset = buf->stack[--buf->stack_index];
  buf->offset = offset;
  return MP4WR_OK;
}

typedef struct be64 {
  uint64_t u;
} be64;
#define be64(X) (be64){htonll(X)}
typedef fourcc be32;
#define be32(X) fourcc(X)
typedef struct be16 {
  uint16_t u;
} be16;
#define be16(X) (be16){htons(X)}

#define MP4T(E,L) \
  E(fourcc, major_brand) \
  E(be64, be_major_version) \
  L(fourcc, compatible_brands)
MP4_T(ftyp, false)
#undef MP4T

typedef struct fmat3x3 { fourcc d[3][3]; } fmat3x3;
#define fmat3x3(a,b,u,c,d,v,x,y,w) \
  (fmat3x3){{ \
    {fourcc(a), fourcc(b), fourcc(u)}, \
    {fourcc(c), fourcc(d), fourcc(v)}, \
    {fourcc(x), fourcc(y), fourcc(w)} \
  }}

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, creation_time) \
  E(fourcc, modification_time) \
  E(fourcc, time_scale) \
  E(fourcc, duration) \
  E(fourcc, preferred_rate) \
  E(be16, preferred_volume) \
  E(be16, reserved) \
  E(uint32_t, reserved2) \
  E(uint32_t, reserved3) \
  E(fmat3x3, matrix) \
  E(fourcc, preview_time) \
  E(fourcc, preview_duration) \
  E(fourcc, poster_time) \
  E(fourcc, selection_time) \
  E(fourcc, selection_duration) \
  E(fourcc, current_time) \
  E(fourcc, next_track_id)
MP4_T(mvhd, false)
#undef MP4T

enum {
  TKHD_FLAG_ENABLED = (1<<0),
  TKHD_FLAG_MOVIE     = (1<<1),
  TKHD_FLAG_PREVIEW   = (1<<2),
  TKHD_FLAG_POSTER    = (1<<3),
};

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, creation_time) \
  E(fourcc, modification_time) \
  E(fourcc, track_id) \
  E(uint32_t, reserved) \
  E(fourcc, duration) \
  E(uint32_t, reserved2) \
  E(uint32_t, reserved3) \
  E(be16, layer) \
  E(be16, alternate_group) \
  E(be16, volume) \
  E(be16, reserved4) \
  E(fmat3x3, matrix) \
  E(fourcc, width) \
  E(fourcc, height)
MP4_T(tkhd, false)
#undef MP4T

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, creation_time) \
  E(fourcc, modification_time) \
  E(fourcc, time_scale) \
  E(fourcc, duration) \
  E(be16, language) \
  E(be16, quality)
MP4_T(mdhd, false)
#undef MP4T

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, type) \
  E(fourcc, subtype) \
  E(fourcc, manufacturer) \
  E(fourcc, flags) \
  E(fourcc, flags_mask) \
  L(char, name)
MP4_T(hdlr, false)
#undef MP4T

enum {
  VMHD_FLAG_NO_LEAN_AHEAD = (1<<0)
};

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(be16, graphics_mode) \
  E(be16, optcolor_red) \
  E(be16, optcolor_green) \
  E(be16, optcolor_blue)
MP4_T(vmhd, false)
#undef MP4T

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(be32, count)
MP4_T(dref, true)
#undef MP4T

#define MP4T(E,L) \
  L(char, url)
MP4_T(url, false)
#undef MP4T

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(be32, track_id) \
  E(be32, default_sample_description_index) \
  E(be32, default_sample_duration) \
  E(be32, default_sample_size) \
  E(be32, default_sample_flags)
MP4_T(trex, false)
#undef MP4T

#define MP4T(E,L) \
  E(fourcc, version_flags)
MP4_T(meta, true)
#undef MP4T

typedef struct stts_entry_t {
  be32 sample_count;
  be32 sample_delta;
} stts_entry_t;

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, count) \
  L(stts_entry_t, sample)
MP4_T(stts, false) // time-to-sample
#undef MP4T

typedef struct stsc_entry_t {
  be32 first_chunk;
  be32 samples_per_chunk;
  be32 sample_description_index;
} stsc_entry_t;

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, count) \
  L(stsc_entry_t, entry)
MP4_T(stsc, false) // sample-to-chunk, partial data-offset information
#undef MP4T

typedef struct stsz_entry_t {
  be32 entry_size;
} stsz_entry_t;

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, sample_size) \
  E(fourcc, sample_count) \
  L(stsz_entry_t, samples)
MP4_T(stsz, false) // sample sizes (framing)
#undef MP4T

typedef struct stco_entry_t {
  be32 chunk_offset;
} stco_entry_t;

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, count) \
  L(stco_entry_t, entry)
MP4_T(stco, false) // chunk offset, partial data-offset information
#undef MP4T


#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, count)
MP4_T(stsd, true) // sample descriptions (codec types, initialization etc.)
#undef MP4T

typedef char c32[32];

#define MP4T(E,L) \
  E(be16, reserved1) \
  E(be16, reserved2) \
  E(be16, reserved3) \
  E(be16, data_reference_index) \
  E(be16, reserved4) \
  E(be16, reserved5) \
  E(be32, reserved6) \
  E(be32, reserved7) \
  E(be32, reserved8) \
  E(be16, width) \
  E(be16, height) \
  E(be32, resolution_horizontal) \
  E(be32, resolution_vertical) \
  E(be32, reserved9) \
  E(be16, frame_count) \
  E(c32, compressor_name) \
  E(be16, depth) \
  E(be16, p1) /* must be -1 */
MP4_T(avc1, true) // h264
#undef MP4T

typedef struct AVC_NALU_data_t {
  uint16_t data_count;
  uint8_t* data;
} AVC_NALU_data_t;

typedef struct mp4_box_avcC_t {
   uint8_t version;
   uint8_t profile_indication;
   uint8_t profile_compatibility;
   uint8_t level_indication;
   uint8_t NALU_len;
   uint8_t SPS_count;
   AVC_NALU_data_t* SPS;
   uint8_t PPS_count;
   AVC_NALU_data_t* PPS;
   uint8_t chroma_format;
   uint8_t bit_depth_luma;
   uint8_t bit_depth_chroma;
   uint8_t SPSE_count;
   AVC_NALU_data_t* SPSE;
} mp4_box_avcC_t;

static enum mp4_write_result mp4_box_avcC_false(
  struct mp4_outbuf* buf,
  const mp4_box_avcC_t*restrict const a
){
  if( a->NALU_len < 1 || a->NALU_len > 4 || a->SPS_count > 32
   || a->chroma_format >= 4 || a->bit_depth_luma < 8 || a->bit_depth_luma >= 16
   || a->bit_depth_luma < 8 || a->bit_depth_luma >= 16
  ) return MP4WR_INVALID_DATA;
  size_t size = 8 + 7 + a->SPS_count*2 + a->PPS_count*2;
  for(int i=0; i<a->SPS_count; i++)
    size += a->SPS[i].data_count;
  for(int i=0; i<a->PPS_count; i++)
    size += a->PPS[i].data_count;
  if( a->profile_indication == 100 || a->profile_indication == 110
   || a->profile_indication == 122 || a->profile_indication == 144
  ){
    size += 4 + a->SPSE_count * 2;
    for(int i=0; i<a->SPSE_count; i++)
      size += a->SPSE[i].data_count;
  }
  const enum mp4_write_result ret = mp4_box_write(buf, size, fourcc("avcC"));
  if(ret < 0)
    return ret;
  if(size > buf->offset-buf->size)
    return MP4WR_BUFFER_TOO_SMALL;
  memcpy(&buf->data[buf->offset+ 0], &a->version, 1); // Should be 1
  memcpy(&buf->data[buf->offset+ 1], &a->profile_indication, 1);
  memcpy(&buf->data[buf->offset+ 2], &a->profile_compatibility, 1);
  memcpy(&buf->data[buf->offset+ 3], &a->level_indication, 1);
  memcpy(&buf->data[buf->offset+ 4], &(uint8_t){0xFC | (a->NALU_len-1)}, 1);
  memcpy(&buf->data[buf->offset+ 5], &(uint8_t){0xE0 | a->SPS_count}, 1);
  buf->offset += 6;
  for(int i=0; i<a->SPS_count; i++){
    const AVC_NALU_data_t*const nalu = &a->SPS[i];
    memcpy(&buf->data[buf->offset], &(uint16_t){htons(nalu->data_count)}, 2);
    memcpy(&buf->data[buf->offset+2], nalu->data, nalu->data_count);
    buf->offset += 2 + nalu->data_count;
  }
  memcpy(&buf->data[buf->offset], &a->PPS_count, 1); buf->offset += 1;
  for(int i=0; i<a->PPS_count; i++){
    const AVC_NALU_data_t*const nalu = &a->PPS[i];
    memcpy(&buf->data[buf->offset], &(uint16_t){htons(nalu->data_count)}, 2);
    memcpy(&buf->data[buf->offset+2], nalu->data, nalu->data_count);
    buf->offset += 2 + nalu->data_count;
  }
  if( a->profile_indication == 100 || a->profile_indication == 110
   || a->profile_indication == 122 || a->profile_indication == 144
  ){
    memcpy(&buf->data[buf->offset+0], &(uint8_t){0xFC|a->chroma_format}, 1);
    memcpy(&buf->data[buf->offset+1], &(uint8_t){0xF8|(a->bit_depth_luma-8)}, 1);
    memcpy(&buf->data[buf->offset+2], &(uint8_t){0xF8|(a->bit_depth_chroma-8)}, 1);
    memcpy(&buf->data[buf->offset+3], &a->SPSE_count, 1);
    buf->offset += 4;
    for(int i=0; i<a->SPSE_count; i++){
      const AVC_NALU_data_t*const nalu = &a->SPSE[i];
      memcpy(&buf->data[buf->offset], &(uint16_t){htons(nalu->data_count)}, 2);
      memcpy(&buf->data[buf->offset+2], nalu->data, nalu->data_count);
      buf->offset += 2 + nalu->data_count;
    }
  }
  return MP4WR_OK;
}

#define MP4T(E,L) \
   E(be32, horizontal_spacing) \
   E(be32, vertical_spacing)
MP4_T(pasp, false)
#undef MP4T

typedef struct mp4_box_colr_t {
  fourcc type;
  union {
    struct {
      be16 colour_primaries;
      be16 transfer_characteristics;
      be16 matrix_coefficients;
      bool full_range_flag;
    } nclx;
    struct {
      be16 primaries_index;
      be16 transfer_function_index;
      be16 matrix_index;
    } nclc;
    struct {
      size_t icc_length;
      unsigned char* icc;
    } rICC, prof;
  };
} mp4_box_colr_t;

static enum mp4_write_result mp4_box_colr_false(
  struct mp4_outbuf* buf,
  const mp4_box_colr_t*restrict const a
){
  size_t size = 8 + 4;
  if(a->type.u == fourcc("nclx").u) size += 7;
  else if(a->type.u == fourcc("nclc").u) size += 6;
  else if(a->type.u == fourcc("rICC").u) size += a->rICC.icc_length;
  else if(a->type.u == fourcc("prof").u) size += a->prof.icc_length;
  const enum mp4_write_result ret = mp4_box_write(buf, size, fourcc("colr"));
  if(ret < 0)
    return ret;
  if(size > buf->offset-buf->size)
    return MP4WR_BUFFER_TOO_SMALL;
  memcpy(&buf->data[buf->offset], &a->type, 4); buf->offset += 4;
  if(a->type.u == fourcc("nclx").u){
    memcpy(&buf->data[buf->offset+0], &a->nclx.colour_primaries, 2);
    memcpy(&buf->data[buf->offset+2], &a->nclx.transfer_characteristics, 2);
    memcpy(&buf->data[buf->offset+4], &a->nclx.matrix_coefficients, 2);
    memcpy(&buf->data[buf->offset+6], &(unsigned char){a->nclx.full_range_flag<<7}, 1);
    buf->offset += 7;
  }else if(a->type.u == fourcc("nclc").u){
    memcpy(&buf->data[buf->offset+0], &a->nclc.primaries_index, 2);
    memcpy(&buf->data[buf->offset+2], &a->nclc.transfer_function_index, 2);
    memcpy(&buf->data[buf->offset+4], &a->nclc.matrix_index, 2);
    buf->offset += 6;
  }else if(a->type.u == fourcc("rICC").u
        || a->type.u == fourcc("prof").u
  ){
    memcpy(&buf->data[buf->offset], a->rICC.icc, a->rICC.icc_length);
    buf->offset += a->rICC.icc_length;
  }
  return MP4WR_OK;
}

#define MP4T(E,L) \
  E(fourcc, version_flags) \
  E(fourcc, sequence_number) \
MP4_T(mfhd, false)
#undef MP4T

enum tfhd_flags {
  TFHD_FLAG_BASE_DATA_OFFSET_PRESENT = 1<<0,
  TFHD_FLAG_SAMPLE_DESCRIPTION_INDEX_PRESENT = 1<<1,
  TFHD_FLAG_DEFAULT_SAMPLE_DURATION_PRESENT = 1<<3,
  TFHD_FLAG_DEFAULT_SAMPLE_SIZE_PRESENT = 1<<4,
  TFHD_FLAG_DEFAULT_SAMPLE_FLAGS_PRESENT = 1<<5,
  TFHD_FLAG_DURATION_IS_EMPTY = 1<<16,
  TFHD_FLAG_DEFAULT_BASE_IS_MOOF = 1<<17,
};

typedef struct mp4_box_tfhd_t {
  uint32_t version_flags;
  uint32_t track_id;
  uint64_t base_data_offset;
  fourcc sample_description_index;
  fourcc default_sample_duration;
  fourcc default_sample_size;
  fourcc default_sample_flags;
} mp4_box_tfhd_t;

static enum mp4_write_result mp4_box_tfhd_false(
  struct mp4_outbuf* buf,
  const mp4_box_tfhd_t*restrict const a
){
  const bool f_bdop = a->version_flags & TFHD_FLAG_BASE_DATA_OFFSET_PRESENT;
  const bool f_sdip = a->version_flags & TFHD_FLAG_SAMPLE_DESCRIPTION_INDEX_PRESENT;
  const bool f_dsdp = a->version_flags & TFHD_FLAG_DEFAULT_SAMPLE_DURATION_PRESENT;
  const bool f_dssp = a->version_flags & TFHD_FLAG_DEFAULT_SAMPLE_SIZE_PRESENT;
  const bool f_dsfp = a->version_flags & TFHD_FLAG_DEFAULT_SAMPLE_FLAGS_PRESENT;
  // const bool f_die = a->version_flags & TFHD_FLAG_DURATION_IS_EMPTY;
  // const bool f_dbim = a->version_flags & TFHD_FLAG_DEFAULT_BASE_IS_MOOF;
  size_t size = 8 + 8 + f_bdop + f_sdip + f_dsdp + f_dssp + f_dsfp;
  const enum mp4_write_result ret = mp4_box_write(buf, size, fourcc("tfhd"));
  if(ret < 0)
    return ret;
  if(size > buf->offset-buf->size)
    return MP4WR_BUFFER_TOO_SMALL;
  memcpy(&buf->data[buf->offset], &(uint32_t){htonl(a->version_flags)}, 4); buf->offset += 4;
  memcpy(&buf->data[buf->offset], &a->track_id, 4); buf->offset += 4;
  if(f_bdop){
    memcpy(&buf->data[buf->offset], &(uint32_t){htonll(a->base_data_offset)}, 8);
    buf->offset += 8;
  }
  if(f_sdip){
    memcpy(&buf->data[buf->offset], &a->sample_description_index, 4);
    buf->offset += 4;
  }
  if(f_dsdp){
    memcpy(&buf->data[buf->offset], &a->default_sample_duration, 4);
    buf->offset += 4;
  }
  if(f_dssp){
    memcpy(&buf->data[buf->offset], &a->default_sample_size, 4);
    buf->offset += 4;
  }
  if(f_dsfp){
    memcpy(&buf->data[buf->offset], &a->default_sample_flags, 4);
    buf->offset += 4;
  }
  return MP4WR_OK;
}
