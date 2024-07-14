
SOURCES += libbluray/src/libbluray/decoders/graphics_processor.c
SOURCES += libbluray/src/libbluray/decoders/pg_decode.c
SOURCES += libbluray/src/libbluray/decoders/textst_decode.c
SOURCES += libbluray/src/libbluray/decoders/rle.c
SOURCES += libbluray/src/libbluray/decoders/pes_buffer.c
SOURCES += libbluray/src/libbluray/decoders/ig_decode.c
SOURCES += libbluray/src/libbluray/decoders/m2ts_demux.c
SOURCES += libbluray/src/libbluray/decoders/graphics_controller.c
SOURCES += libbluray/src/libbluray/decoders/m2ts_filter.c
SOURCES += libbluray/src/libbluray/decoders/textst_render.c
SOURCES += libbluray/src/libbluray/bluray.c
SOURCES += libbluray/src/libbluray/disc/dec.c
SOURCES += libbluray/src/libbluray/disc/aacs.c
SOURCES += libbluray/src/libbluray/disc/bdplus.c
SOURCES += libbluray/src/libbluray/disc/disc.c
#SOURCES += libbluray/src/libbluray/disc/udf_fs.c
SOURCES += libbluray/src/libbluray/disc/properties.c
SOURCES += libbluray/src/libbluray/register.c
#SOURCES += libbluray/src/libbluray/bdj/native/register_native.c
#SOURCES += libbluray/src/libbluray/bdj/native/java_awt_BDGraphics.c
#SOURCES += libbluray/src/libbluray/bdj/native/util.c
#SOURCES += libbluray/src/libbluray/bdj/native/java_awt_BDFontMetrics.c
#SOURCES += libbluray/src/libbluray/bdj/native/org_videolan_Logger.c
#SOURCES += libbluray/src/libbluray/bdj/native/bdjo.c
#SOURCES += libbluray/src/libbluray/bdj/native/org_videolan_Libbluray.c
SOURCES += libbluray/src/libbluray/bdj/bdjo_parse.c
#SOURCES += libbluray/src/libbluray/bdj/bdj.c
SOURCES += libbluray/src/libbluray/bdnav/sound_parse.c
SOURCES += libbluray/src/libbluray/bdnav/index_parse.c
SOURCES += libbluray/src/libbluray/bdnav/clpi_parse.c
SOURCES += libbluray/src/libbluray/bdnav/navigation.c
SOURCES += libbluray/src/libbluray/bdnav/uo_mask.c
SOURCES += libbluray/src/libbluray/bdnav/bdmv_parse.c
SOURCES += libbluray/src/libbluray/bdnav/bdid_parse.c
SOURCES += libbluray/src/libbluray/bdnav/meta_parse.c
SOURCES += libbluray/src/libbluray/bdnav/extdata_parse.c
SOURCES += libbluray/src/libbluray/bdnav/mpls_parse.c
SOURCES += libbluray/src/libbluray/hdmv/mobj_parse.c
SOURCES += libbluray/src/libbluray/hdmv/mobj_print.c
SOURCES += libbluray/src/libbluray/hdmv/hdmv_vm.c

SOURCES += libbluray/src/util/array.c
SOURCES += libbluray/src/util/bits.c
SOURCES += libbluray/src/util/event_queue.c
SOURCES += libbluray/src/util/logging.c
SOURCES += libbluray/src/util/refcnt.c
SOURCES += libbluray/src/util/strutl.c
SOURCES += libbluray/src/util/time.c

SOURCES += libbluray/src/file/file.c
SOURCES += libbluray/src/file/file_posix.c
SOURCES += libbluray/src/file/dir_posix.c
SOURCES += libbluray/src/file/dirs_xdg.c

SOURCES += extra/stubs.c
SOURCES += extra/setup.c
SOURCES += extra/mount_get_mountpoint.c
SOURCES += extra/event_loop.c
SOURCES += extra/decode_pg_rle.c

WASMCFLAGS += -DHAVE_CONFIG_H

OBJECTS=$(patsubst %,build/o/%.o,$(SOURCES))

WASMCFLAGS += -Iextra -fvisibility=default
WASMCFLAGS += -Ilibbluray/src/ -Ilibbluray/src/libbluray/
WASMCFLAGS += -std=c99
WASMCFLAGS += -fstack-protector-all
OPTIMIZE += -O2 # -g

WASMCC = clang-16 --target=wasm32-wasi -D_GNU_SOURCE

BIN += www/build/libbluray.async.wasm
BIN += www/build/asyncify.mjs

all: $(BIN)

#build/o/libbluray/%.c.o:

www/build/libbluray.wasm: $(OBJECTS)
	mkdir -p $(dir $@)
	$(WASMCC) $(OPTIMIZE) -Wl,--error-limit=0 \
	   -Wl,--export-dynamic -Wl,--allow-undefined \
	   -Wl,--export=malloc -Wl,--export=free \
	   -Wl,--export=__stack_low -Wl,--export=__stack_high -Wl,--export=__stack_pointer \
	   -o $@ $^

%.async.wasm: %.wasm
	wasm-opt $(OPTIMIZE) --asyncify $< -o $@

www/build/asyncify.mjs: asyncify/asyncify.mjs
	mkdir -p $(dir $@)
	cp $< $@

build/o/%.c.o: %.c
	mkdir -p $(dir $@)
	$(WASMCC) $(WASMCFLAGS) $(OPTIMIZE) -c -o $@ $^

clean:
	rm -f $(OBJECTS)
	rm -f www/module/build/libbluray.wasm
	rm -f www/module/build/libbluray.async.wasm
