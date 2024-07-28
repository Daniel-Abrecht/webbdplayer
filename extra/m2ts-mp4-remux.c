#include "mp4.h"
#include "scratch.h"
#include "remuxer.h"
#include <stdio.h>

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

enum avc_decoder_state {
  AVCD_DETERMINE_START_BYTE,
  AVCD_DECODE_DATA,
};

enum {
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

struct AVCDecoder {
  unsigned short zero_counter;
};

struct m2ts_mp4_remuxer {
  enum state state;
  struct AVCDecoder avc_decoder;
  signed char type;
  unsigned char nalu_zero_counter;
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
};

static bool ts_parse(struct PES_chunk* res, unsigned char pkg[restrict TS_SIZE]){
  res->length = 0;
  res->data = 0;
  if(pkg[0] != 0x47) return false; // No sync byte
  if(pkg[1] & 0x80) return false; // Transport error indicated
  bool pusi = pkg[1] & 0x40;
  uint16_t pid = ((pkg[1] & 0x1f) << 8) | pkg[2];
  unsigned payload_exists = pkg[3] & 0x10;
  unsigned payload_offset = (pkg[3] & 0x20) ? pkg[4] + 5 : 4;
  if(payload_offset >= TS_SIZE) return true;
  if(!payload_exists) return true;
  pkg += payload_offset;
  res->pid = pid;
  res->fresh = pusi;
  if(pusi){
    unsigned pes_pid    = pkg[3];
    // unsigned pes_length = pkg[4] << 8 | pkg[5];
    unsigned hdr_len    = 6;
    if(pes_pid != 0xbf){
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
  switch(remuxer.state){
    case INIT: {
      remuxer.tmp.data = scratch_start;
      for(unsigned i=0; i+PACKET_SIZE-1<size; i+=PACKET_SIZE){
        struct PES_chunk pkg;
        if(!ts_parse(&pkg, &input[i+TS_OFFSET])){
          fprintf(stderr, "ts_parse failed\n");
          continue;
        }
        if(pkg.pid == 0x1011){ // TODO: Don't hardcode this, video PID may vary
          const unsigned char *it=pkg.data, *const end=pkg.data+pkg.length;
          remuxer.type = -1;
          while(it < end){
            const unsigned char*const start = it;
            for(; it<end; it++){
              const unsigned char c = *it;
              if(c == 0){
                if(remuxer.nalu_zero_counter < 3)
                  remuxer.nalu_zero_counter += 1;
              }else if(c == 1 && remuxer.nalu_zero_counter >= 2){
                break;
              }else{
                remuxer.nalu_zero_counter = 0;
              }
            }
            if(remuxer.type < 0)
              remuxer.type = start[0] & 0x1F;
            const bool sps = remuxer.type == NALU_TYPE_SEQUENCE_PARAMETER_SET;
            const bool pps = remuxer.type == NALU_TYPE_PICTURE_PARAMETER_SET;
            const bool of_interest = sps || pps;
            if(of_interest){
              const unsigned size = it - start;
              remuxer.tmp.length += size;
              memcpy(scratch_start, start, size);
              // fprintf(stderr, "%p %d %d %u\n", scratch_start, remuxer.type, it == end, size);
              scratch_mark_used(size);
            }
            if(it == end)
              break;
            if(of_interest){
              remuxer.tmp.length -= remuxer.nalu_zero_counter;
              scratch_free(remuxer.nalu_zero_counter);
            }
            if(sps){
              remuxer.sps = remuxer.tmp;
              // fprintf(stderr, "%02X %02X %02X %02X %02X %02X %02X %02X\n", remuxer.sps.data[0], remuxer.sps.data[1], remuxer.sps.data[2], remuxer.sps.data[3], remuxer.sps.data[4], remuxer.sps.data[5], remuxer.sps.data[6], remuxer.sps.data[7]);
              remuxer.tmp.data = scratch_start;
              remuxer.tmp.length = 0;
            }else if(pps){
              remuxer.pps = remuxer.tmp;
              remuxer.tmp.data = scratch_start;
              remuxer.tmp.length = 0;
            }
            it += 1;
            remuxer.type = -1;
            remuxer.nalu_zero_counter = 0;
          }
          if(remuxer.sps.data && remuxer.pps.data)
            break;
        }
      }
      if(!remuxer.sps.data || !remuxer.pps.data)
        break;
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
              mp4_box_start(&remuxer.mp4, fourcc("dinf"));
                mp4_t_box_start(dref, &remuxer.mp4, .count = be32(1) );
                  mp4_t_box_write(url, &remuxer.mp4, list(((char[]){0,0,0,1})));
                  mp4_box_commit(&remuxer.mp4);
                mp4_box_commit(&remuxer.mp4);
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
    } break;
    case REMUX: {
      remuxer.mp4.data = scratch_start;
      remuxer.mp4.size = scratch_size;

    } break;
  }
  if(remuxer.mp4.stack_index){
    while(remuxer.mp4.stack_index)
      //mp4_box_commit(&remuxer.mp4);
      mp4_box_rollback(&remuxer.mp4);
  }
  int out_size = remuxer.mp4.offset;
  remuxer.mp4.offset = 0;
  return (struct bo){
    .data = remuxer.mp4.data,
    .length = out_size,
  };
}

