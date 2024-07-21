#include "mp4.h"
#include "scratch.h"

enum state {
  INIT,
  REMUX,
};

struct m2ts_mp4_remuxer {
  enum state state;
  struct mp4_outbuf mp4;
};

static struct m2ts_mp4_remuxer remuxer = {
  .mp4 = {
    .data = scratch_buf,
    .size = sizeof(scratch_buf),
  }
};

#define MP4_DEFAULT_MATRIX fmat3x3(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

int remux_buffer(int size, unsigned char input[size]){
  switch(remuxer.state){
    case INIT: {
      uint16_t depth = 24;
      uint32_t width = 1920;
      uint32_t height = 1080;
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
                    // avcC
                    // colr
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

    } break;
  }
  if(remuxer.mp4.stack_index){
    while(remuxer.mp4.stack_index)
      mp4_box_commit(&remuxer.mp4);
      //mp4_box_rollback(&remuxer.mp4);
    return -1; // There are still opened atoms!
  }
  int out_size = remuxer.mp4.offset;
  remuxer.mp4.offset = 0;
  return out_size;
}
