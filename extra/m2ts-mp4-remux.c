#include "mp4.h"
#include "scratch.h"
#include "remuxer.h"
#include <stdio.h>

#define dbg_print(...) fprintf(stderr, __VA_ARGS__)

enum {
  PACKET_SIZE = 192,
  TS_OFFSET = 4,
  TS_SIZE = PACKET_SIZE - TS_OFFSET,
};

enum {
  PID_PROGRAM_ASSOCIATION_TABLE = 0,
};

enum state {
  INIT,
  REMUX,
};

enum {
  NALU_TYPE_CODED_SLICE_NON_IDR_PICTURE = 1,
  NALU_TYPE_CODED_SLICE_DATA_PARTITION_A = 2,
  NALU_TYPE_CODED_SLICE_DATA_PARTITION_B = 3,
  NALU_TYPE_CODED_SLICE_DATA_PARTITION_C = 4,
  NALU_TYPE_CODED_SLICE_IDR_PICTURE = 5,
  NALU_TYPE_SUPPLEMENTAL_ENHANCEMENT_INFORMATION = 6,
  NALU_TYPE_SEQUENCE_PARAMETER_SET = 7,
  NALU_TYPE_PICTURE_PARAMETER_SET = 8,
  NALU_TYPE_ACCESS_UNIT_DELIMITER = 9,
  NALU_TYPE_END_OF_SEQUENCE = 10,
  NALU_TYPE_END_OF_STREAM = 11,
  NALU_TYPE_FILLER_DATA = 12,
  NALU_TYPE_SEQUENCE_PARAMETER_SET_EXTENSION = 13,
  NALU_TYPE_PREFIX_NAL_UNIT = 14,
  NALU_TYPE_SUBSET_SEQUENCE_PARAMETER_SET = 15,
};

struct video_chunk {
  const unsigned char* data;
  uint32_t size : 30;
  uint32_t complete : 1;
  uint32_t is_start : 1;
  uint32_t pts;
};

struct audio_chunk {
  int tmp;
};

struct chunk {
  struct video_chunk video;
  struct audio_chunk audio;
};

struct nalu_splitter {
  unsigned char zero_counter;
  signed char type;
  bool found;
};

// returns the size of the current chunk. THIS CAN BE NEGATIVE!
static int next_nalu(struct nalu_splitter*const n, const unsigned char**const pit, const unsigned char*const end){
  const unsigned char* start = *pit;
  const unsigned char*restrict it = start;
  if(it >= end) return 0;
  unsigned zero_counter = n->zero_counter;
  if(n->found)
    n->type = it[0] & 0x1F;
  n->found = false;
  while(it<end){
    const unsigned c = *(it++);
    if(c == 0){
      if(zero_counter < 3)
        zero_counter += 1;
    }else if(c == 1 && zero_counter >= 2){
      n->found = true;
      n->zero_counter = 0;
      *pit = it;
      return it - start - zero_counter - 1;
    }else{
      zero_counter = 0;
    }
  }
  n->zero_counter = zero_counter;
  *pit = it;
  return it - start;
}

struct m2ts_mp4_remuxer {
  enum state state;
  struct nalu_splitter nalu_splitter;
  unsigned sequence_number;
  int64_t video_pts, video_dts;
  uint64_t base_media_decode_time;
  struct chunk* chunks_top;
  struct chunk* video_chunks;
  struct chunk* audio_chunks;
  struct bo tmp;
  struct bo sps;
  struct bo pps;
  struct mp4_outbuf mp4;
};

static struct m2ts_mp4_remuxer remuxer = {0};

struct PES_chunk {
  short pid;
  bool fresh;
  unsigned length;
  unsigned char* data;
  int64_t pts, dts;
};

static int64_t parse_timestamp(uint8_t *p){
  int64_t ts;
  ts  = ((int64_t)(p[0] & 0x0E)) << 29;
  ts |=  p[1]         << 22;
  ts |= (p[2] & 0xFE) << 14;
  ts |=  p[3]         <<  7;
  ts |= (p[4] & 0xFE) >>  1;
  return ts;
}

static bool ts_parse(struct PES_chunk* res, unsigned char pkg[restrict TS_SIZE]){
  res->pts = -1;
  res->dts = -1;
  res->length = 0;
  res->data = 0;
  if(pkg[0] != 0x47){
    dbg_print("Not a sync byte\n");
    return false;
  }
  if(pkg[1] & 0x80){
    dbg_print("Transport error indicated\n");
    return false;
  }
  const bool pusi = pkg[1] & 0x40;
  const uint16_t pid = ((pkg[1] & 0x1f) << 8) | pkg[2];
  const unsigned payload_exists = pkg[3] & 0x10;
  const unsigned payload_offset = (pkg[3] & 0x20) ? pkg[4] + 5 : 4;
  if(payload_offset > TS_SIZE){
    dbg_print("payload size too big: %u > %u\n", payload_offset, TS_SIZE);
    return false;
  }
  if(!payload_exists) return true;
  pkg += payload_offset;
  res->pid = pid;
  res->fresh = pusi;
  if(pusi){
    const unsigned pes_pid    = pkg[3];
    // unsigned pes_length = pkg[4] << 8 | pkg[5];
    unsigned hdr_len    = 6;
    if(pes_pid != 0xBF){
      if(pkg[7] & 0x80)
        res->pts = parse_timestamp(&pkg[9]);
      if(pkg[7] & 0x40)
        res->dts = parse_timestamp(&pkg[14]);
      hdr_len += pkg[8] + 3;
    }
    res->length = TS_SIZE-payload_offset-hdr_len;
    res->data = &pkg[hdr_len];
  }else{
    res->length = TS_SIZE-payload_offset;
    res->data = pkg;
  }
  return true;
}

#define MP4_DEFAULT_MATRIX fmat3x3(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

struct range {
  unsigned char* start;
  unsigned char* end;
};

struct bo remux_buffer(int size, unsigned char input[size]){
  bool skip_initial_data = false;
  switch(remuxer.state){
    case INIT: {
      skip_initial_data = !remuxer.nalu_splitter.found;
      remuxer.chunks_top = (void*)(scratch_start + scratch_size);
      remuxer.video_chunks = remuxer.chunks_top;
      remuxer.audio_chunks = remuxer.chunks_top;
      remuxer.tmp.data = scratch_start;
      for(unsigned i=0; i+PACKET_SIZE-1<size; i+=PACKET_SIZE){
        struct PES_chunk pkg;
        if(!ts_parse(&pkg, &input[i+TS_OFFSET])){
          dbg_print("ts_parse failed\n");
          continue;
        }
        if(pkg.pid == 0x1011){ // TODO: Don't hardcode this, video PID may vary
          const unsigned char *it=pkg.data, *const end=pkg.data+pkg.length;
          while(it < end){
            const unsigned char*const start = it;
            int size = next_nalu(&remuxer.nalu_splitter, &it, end);
            const bool sps = remuxer.nalu_splitter.type == NALU_TYPE_SEQUENCE_PARAMETER_SET;
            const bool pps = remuxer.nalu_splitter.type == NALU_TYPE_PICTURE_PARAMETER_SET;
            const bool of_interest = sps || pps;
            if(of_interest){
              remuxer.tmp.length += size;
              memcpy(scratch_start, start, size);
              // dbg_print("%p %d %d %u\n", scratch_start, remuxer.type, it == end, size);
              scratch_mark_used(size);
            }
            if(!remuxer.nalu_splitter.found)
              break;
            if(sps){
              remuxer.sps = remuxer.tmp;
              // dbg_print("%02X %02X %02X %02X %02X %02X %02X %02X\n", remuxer.sps.data[0], remuxer.sps.data[1], remuxer.sps.data[2], remuxer.sps.data[3], remuxer.sps.data[4], remuxer.sps.data[5], remuxer.sps.data[6], remuxer.sps.data[7]);
              remuxer.tmp.data = scratch_start;
              remuxer.tmp.length = 0;
            }else if(pps){
              remuxer.pps = remuxer.tmp;
              remuxer.tmp.data = scratch_start;
              remuxer.tmp.length = 0;
            }
          }
          if(remuxer.sps.data && remuxer.pps.data)
            break;
        }
      }
      if(!remuxer.sps.data || !remuxer.pps.data)
        break;
      remuxer.nalu_splitter.found = skip_initial_data;
      // TODO: unescape sps && pps NALu (00 00 03 XX -> 00 00 XX)

      //// Found an SPS & PPS, make MP4 headers ////
      uint16_t depth = 24;
      uint32_t width = 1920;
      uint32_t height = 1080;
      remuxer.mp4.data = scratch_start;
      remuxer.mp4.size = scratch_size;
      scratch_free(remuxer.sps.length + remuxer.pps.length);

      mp4_t_box_write(ftyp, &remuxer.mp4, fourcc("isom"), htonll(0x0000020069736F6Dllu), list(((fourcc[]){{"isom"},{"iso2"},{"avc1"},{"mp41"}})) );
      mp4_box_start(&remuxer.mp4, fourcc("moov"));
        mp4_t_box_write(mvhd, &remuxer.mp4,
          .time_scale = be32(1000),
          .preferred_rate = be32(0x10000),
          .preferred_volume = be16(0x100),
          .matrix = MP4_DEFAULT_MATRIX,
          .next_track_id = be32(2)
        );
        mp4_box_start(&remuxer.mp4, fourcc("trak"));
          mp4_t_box_write(tkhd, &remuxer.mp4,
            .version_flags = be32(TKHD_FLAG_ENABLED | TKHD_FLAG_MOVIE),
            .track_id = be32(1),
            .matrix = MP4_DEFAULT_MATRIX,
            .width  = be32(width<<16),
            .height = be32(height<<16),
          );
          mp4_box_start(&remuxer.mp4, fourcc("mdia"));
            mp4_t_box_write(mdhd, &remuxer.mp4,
              .time_scale = be32(90000), // https://stackoverflow.com/questions/77803940/diffrence-between-mvhd-box-timescale-and-mdhd-box-timescale-in-isobmff-format
            );
            mp4_t_box_write(hdlr, &remuxer.mp4,
              .subtype = fourcc("vide"),
              dlist(name, "VideoHandler"),
            );
            mp4_box_start(&remuxer.mp4, fourcc("minf"));
              mp4_t_box_write(vmhd, &remuxer.mp4,
                .version_flags = be32(VMHD_FLAG_NO_LEAN_AHEAD),
              );
              // mp4_box_start(&remuxer.mp4, fourcc("dinf"));
              //   mp4_t_box_start(dref, &remuxer.mp4, .count = be32(1) );
              //     mp4_t_box_write(url, &remuxer.mp4, list(((char[]){0,0,0,1})));
              //     mp4_box_commit(&remuxer.mp4);
              //   mp4_box_commit(&remuxer.mp4);
              mp4_box_start(&remuxer.mp4, fourcc("stbl"));
                mp4_t_box_start(stsd, &remuxer.mp4, .count = be32(1) );
                  mp4_t_box_start(avc1, &remuxer.mp4,
                    .data_reference_index = be16(1),
                    .width = be16(width),
                    .height = be16(height),
                    .resolution_horizontal = be32(0x480000),
                    .resolution_vertical = be32(0x480000),
                    .frame_count = be16(1),
                    .depth = be16(depth),
                    .p1 = be16(-1),
                  );
                    mp4_t_box_write(avcC, &remuxer.mp4,
                      .version = 1,
                      .profile_indication = 100,
                      .profile_compatibility = 0,
                      .level_indication = 41,
                      .NALU_len = 4,
                      dlist(SPS, ((AVC_NALU_data_t[]){{ .data_count=remuxer.sps.length, .data=remuxer.sps.data }})),
                      dlist(PPS, ((AVC_NALU_data_t[]){{ .data_count=remuxer.pps.length, .data=remuxer.pps.data }})),
                      .chroma_format = 1,
                      .bit_depth_luma = 8,
                      .bit_depth_chroma = 8,
                    );
                    mp4_t_box_write(colr, &remuxer.mp4, fourcc("nclx"), .nclx={be16(1), be16(1), be16(1)});
                    mp4_t_box_write(pasp, &remuxer.mp4, be32(1), be32(1));
                    mp4_box_commit(&remuxer.mp4);
                  mp4_box_commit(&remuxer.mp4);
                mp4_t_box_write(stts, &remuxer.mp4, 0);
                mp4_t_box_write(stsc, &remuxer.mp4, 0);
                mp4_t_box_write(stsz, &remuxer.mp4, 0);
                mp4_t_box_write(stco, &remuxer.mp4, 0);
                mp4_box_commit(&remuxer.mp4);
              mp4_box_commit(&remuxer.mp4);
            mp4_box_commit(&remuxer.mp4);
          mp4_box_commit(&remuxer.mp4);
        mp4_box_start(&remuxer.mp4, fourcc("mvex"));
          mp4_t_box_write(trex, &remuxer.mp4,
            .track_id = be32(1),
            .default_sample_description_index = be32(1),
          );
          mp4_box_commit(&remuxer.mp4);
        mp4_box_start(&remuxer.mp4, fourcc("udta"));
          mp4_t_box_start(meta, &remuxer.mp4, 0);
            mp4_t_box_write(hdlr, &remuxer.mp4,
              .subtype = fourcc("mdir"),
              .manufacturer = fourcc("appl"),
              dlist(name, ""),
            );
            mp4_box_commit(&remuxer.mp4);
          mp4_box_commit(&remuxer.mp4);
        mp4_box_commit(&remuxer.mp4);
      remuxer.state = REMUX;
    } // fallthrough
    case REMUX: {
      unsigned access_unit_count = 0;
      for(unsigned i=0; i+PACKET_SIZE-1<size; i+=PACKET_SIZE){
        struct PES_chunk pkg;
        if(!ts_parse(&pkg, &input[i+TS_OFFSET])){
          dbg_print("ts_parse failed\n");
          continue;
        }
        if(pkg.pid == 0x1011){ // TODO: Don't hardcode this, video PID may vary
          if(pkg.pts != -1)
            remuxer.video_pts = pkg.pts;
          if(pkg.dts != -1)
            remuxer.video_dts = pkg.dts;
          const unsigned char *it=pkg.data, *const end=pkg.data+pkg.length;
          while(it < end){
            const bool is_start = remuxer.nalu_splitter.found;
            const unsigned char*const start = it;
            int size = next_nalu(&remuxer.nalu_splitter, &it, end);
            if(skip_initial_data){
              if(remuxer.nalu_splitter.found)
                skip_initial_data = false;
              continue;
            }
            if(size < 0){
              remuxer.video_chunks->video.size += size;
              remuxer.video_chunks->video.complete = true;
              if(!remuxer.video_chunks->video.size)
                remuxer.video_chunks++;
            }else if(size){
              (--remuxer.video_chunks)->video = (struct video_chunk){
                .data = start,
                .size = size,
                .complete = remuxer.nalu_splitter.found,
                .is_start = is_start,
                .pts = remuxer.video_pts,
              };
            }else{
              if(remuxer.video_chunks != remuxer.chunks_top)
                remuxer.video_chunks->video.complete = true;
            }
            if(!remuxer.nalu_splitter.found)
              break;
            if(remuxer.nalu_splitter.type == NALU_TYPE_ACCESS_UNIT_DELIMITER)
              access_unit_count += 1;
          }
        }
      }
      struct chunk* c = remuxer.chunks_top;
      if(access_unit_count && (c[-1].video.data[0] & 0x1F) == NALU_TYPE_ACCESS_UNIT_DELIMITER){
        c--;
        access_unit_count--;
      }
      if(access_unit_count){
        const unsigned moof_offset = remuxer.mp4.offset;
        mp4_box_start(&remuxer.mp4, fourcc("moof"));
          mp4_t_box_write(mfhd, &remuxer.mp4, .sequence_number = ++remuxer.sequence_number);
          mp4_box_start(&remuxer.mp4, fourcc("traf"));
            mp4_t_box_write(tfhd, &remuxer.mp4,
              .version_flags = TFHD_FLAG_DEFAULT_SAMPLE_FLAGS_PRESENT,
              // Note: ffmpeg also provides TFHD_FLAG_BASE_DATA_OFFSET_PRESENT TFHD_FLAG_DEFAULT_SAMPLE_DURATION_PRESENT TFHD_FLAG_DEFAULT_SAMPLE_SIZE_PRESENT
              .track_id = 1,
              .default_sample_flags = MOV_FRAG_SAMPLE_FLAG_IS_NON_SYNC
                                    | MOV_FRAG_SAMPLE_FLAG_DEPENDS_YES,
            );
            mp4_t_box_write(tfdt, &remuxer.mp4,
              .version_flags = be32(1u<<24), /* version 1 */
              .base_media_decode_time = be64(remuxer.base_media_decode_time),
            );
            {
              const unsigned trun_offset = remuxer.mp4.offset;
              mp4_t_box_write(trun, &remuxer.mp4,
                .version_flags = TRUN_FLAG_SAMPLE_SIZE_PRESENT
                               | TRUN_FLAG_DATA_OFFSET_PRESENT
                               | TRUN_FLAG_FIRST_SAMPLE_FLAGS_PRESENT
                               | TRUN_FLAG_SAMPLE_DURATION_PRESENT,
                .sample_count = access_unit_count,
                .data_offset = 0,
                .first_sample_flags = MOV_FRAG_SAMPLE_FLAG_DEPENDS_NO,
              );
              memcpy(remuxer.mp4.data+trun_offset+16, &be32(remuxer.mp4.offset+8-moof_offset), 4);
            }
            size_t sample_size = 0;
            unsigned char* trun_sample = remuxer.mp4.data + remuxer.mp4.offset - 8 * access_unit_count;
          mp4_box_commit(&remuxer.mp4);
        mp4_box_commit(&remuxer.mp4);
        mp4_box_start(&remuxer.mp4, fourcc("mdat"));
        for(unsigned n=access_unit_count; n; ){
          int type = -1;
          unsigned char* p_chunk_size = 0;
          while(c-- > remuxer.video_chunks){
            struct video_chunk* vc = &c->video;
            if(vc->is_start)
              type = vc->data[0] & 0x1F;
            if(vc->is_start && type == NALU_TYPE_ACCESS_UNIT_DELIMITER){
              n -= 1;
              uint32_t duration = 0xC382; // TODO
              memcpy(trun_sample, &be32(duration), 4);
              remuxer.base_media_decode_time += duration;
              memcpy(trun_sample+4, &be32(sample_size), 4);
              trun_sample += 8;
              sample_size = 0;
              type = -1;
              break;
            }
            if(type <= 0 || type == NALU_TYPE_FILLER_DATA || type == NALU_TYPE_ACCESS_UNIT_DELIMITER)
              continue;
            if(vc->is_start){
              // if(p_chunk_size)
              //   dbg_print("Previous NALu still incomplete, but new NALu starting\n");
              p_chunk_size = &remuxer.mp4.data[remuxer.mp4.offset];
              remuxer.mp4.offset += 4;
              sample_size += 4;
            }
            memcpy(remuxer.mp4.data + remuxer.mp4.offset, vc->data, vc->size);
            remuxer.mp4.offset += vc->size;
            sample_size += vc->size;
            if(vc->complete){
              // if(!p_chunk_size)
              //   dbg_print("End of NALu, but no NALu was started!\n");
              unsigned size = remuxer.mp4.data + remuxer.mp4.offset - p_chunk_size - 4;
              if(!size){
                remuxer.mp4.offset -= 4;
                sample_size -= 4;
                continue;
              }
              memcpy(p_chunk_size, &be32(size), 4);
              p_chunk_size = 0;
            }
          }
        }
        if(remuxer.mp4.offset - remuxer.mp4.stack[remuxer.mp4.stack_index-1] <= 8){
          mp4_box_rollback(&remuxer.mp4);
          remuxer.mp4.offset = moof_offset;
        }else{
          mp4_box_commit(&remuxer.mp4);
        }
        remuxer.video_chunks = remuxer.chunks_top; // TODO: store remaining
      }
    } break;

  }
  if(remuxer.mp4.stack_index){
    while(remuxer.mp4.stack_index)
      //mp4_box_commit(&remuxer.mp4);
      mp4_box_rollback(&remuxer.mp4);
  }
  struct bo r = {
    .data = remuxer.mp4.data,
    .length = remuxer.mp4.offset,
  };
  if(r.length){
    remuxer.mp4.data = scratch_start;
    remuxer.mp4.size = scratch_size;
    remuxer.mp4.offset = 0;
  }
  return r;
}

