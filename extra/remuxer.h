
struct bo {
  unsigned length;
  unsigned char* data;
};

struct bo remux_buffer(int size, unsigned char* input);
